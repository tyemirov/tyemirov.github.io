// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { validateGallery } from '../../gallery/js/core/catalog.js';

const root = resolve(import.meta.dirname, '../..');
const origin = 'https://studio.example.test';
const key = 'gallery-test-signing-key-not-a-runtime-credential';

function cookie() {
  const now = Math.floor(Date.now() / 1000);
  const data = [ { alg: 'HS256', typ: 'JWT' }, { iss: 'tauth', user_id: 'test-owner-id', user_email: 'owner@example.test', tenant_id: 'gallery-test', iat: now - 60, exp: now + 3600 } ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `gallery_test_session=${data}.${createHmac('sha256', key).update(data).digest('base64url')}`;
}

test('the runnable gallery serves a valid OpenAPI contract and the canonical public catalog', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'gallery-api-'));
  let server;
  try {
    const binary = join(scratch, 'gallery');
    execFileSync('go', ['build', '-o', binary, './cmd/gallery'], { cwd: join(root, 'services/gallery'), stdio: 'pipe' });
    server = spawn(binary, ['--listen=127.0.0.1:0', `--database=${join(scratch, 'gallery.db')}`, `--public-root=${root}`, `--allowed-origin=${origin}`, '--cookie-name=gallery_test_session', '--tenant-id=gallery-test', '--owner-email=owner@example.test'], { env: { ...process.env, GALLERY_TAUTH_SIGNING_KEY: key }, stdio: ['ignore', 'pipe', 'pipe'] });
    const address = await new Promise((resolve, reject) => {
      let output = '';
      server.stderr.on('data', chunk => { output += chunk; const match = output.match(/address=(127\.0\.0\.1:\d+)/); if (match) resolve(`http://${match[1]}`); });
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Gallery exited before readiness: ${code}\n${output}`)));
    });
    const response = await fetch(`${address}/gallery/openapi.json`);
    assert.equal(response.status, 200);
    const schema = await response.json();
    await SwaggerParser.validate(structuredClone(schema));
    assert.deepEqual(schema.paths['/gallery/payment-events'].post.requestBody.content['application/json'].schema.properties.event_type.enum,
      ['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED']);
    const draft = await fetch(`${address}/gallery/draft`, { headers: { Origin: origin, Cookie: cookie() } });
    assert.equal(draft.status, 200);
    const state = await draft.json();
    const validator = addFormats(new Ajv({ strict: false })).compile(schema.paths['/gallery/draft'].get.responses['200'].content['application/json'].schema);
    assert(validator(state), JSON.stringify(validator.errors));
    validateGallery(state.gallery);
    const denied = await fetch(`${address}/gallery/draft`);
    assert.equal(denied.status, 401);
    const errorValidator = addFormats(new Ajv({ strict: false })).compile(schema.paths['/gallery/draft'].get.responses.default.content['application/json'].schema);
    assert(errorValidator(await denied.json()));
    const orders = await fetch(`${address}/gallery/orders?limit=1`, { headers: { Origin: origin, Cookie: cookie() } });
    assert.equal(orders.status, 200);
    const orderPage = await orders.json();
    const orderValidator = addFormats(new Ajv({ strict: false })).compile(schema.paths['/gallery/orders'].get.responses['200'].content['application/json'].schema);
    assert(orderValidator(orderPage), JSON.stringify(orderValidator.errors));
    assert.deepEqual(orderPage, { items: [], nextCursor: null });
    assert.deepEqual(schema.paths['/gallery/orders/{orderId}'].get.security, [{ TAuthSession: [] }, { OrderAccess: [] }]);
    const reissue = schema.paths['/gallery/orders/{orderId}/access-reissues'].post;
    assert.equal(reissue.operationId, 'createAccessReissue');
    assert(reissue.parameters.some(parameter => parameter.name === 'Idempotency-Key' && parameter.required));
    assert.deepEqual(reissue.requestBody.content['application/json'].schema.required, ['verifiedEmail']);
    assert.equal(schema.paths['/gallery/orders/{orderId}/access-reissues/{reissueId}'].get.responses['200'].content['application/json'].schema.properties.accessSecret, undefined);
  } finally {
    if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
    await rm(scratch, { recursive: true, force: true });
  }
});

test('the runnable gallery rejects incomplete PayPal account configuration', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'gallery-payment-config-'));
  try {
    const binary = join(scratch, 'gallery');
    execFileSync('go', ['build', '-o', binary, './cmd/gallery'], { cwd: join(root, 'services/gallery'), stdio: 'pipe' });
    assert.throws(() => execFileSync(binary, ['--payments=paypal', '--paypal-api-origin=https://api-m.sandbox.paypal.com', '--paypal-checkout-origin=https://www.sandbox.paypal.com', '--paypal-client-id=test-client', '--paypal-merchant-id=TESTMERCHANT1', '--paypal-webhook-id=test-webhook', `--database=${join(scratch, 'gallery.db')}`, `--public-root=${root}`, `--allowed-origin=${origin}`, '--cookie-name=gallery_test_session', '--tenant-id=gallery-test', '--owner-email=owner@example.test'], {
      env: { ...process.env, GALLERY_TAUTH_SIGNING_KEY: key, GALLERY_PAYPAL_CLIENT_SECRET: '' }, stdio: 'pipe', timeout: 10000,
    }), error => error.status === 1 && error.stderr.toString().includes('configure PayPal: client credentials, merchant ID, and webhook ID are required'));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('the runnable gallery validates receipt delivery policy before startup', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'gallery-receipt-config-'));
  try {
    const binary = join(scratch, 'gallery');
    execFileSync('go', ['build', '-o', binary, './cmd/gallery'], { cwd: join(root, 'services/gallery'), stdio: 'pipe' });
    for (const scenario of [
      { flags: ['--receipts=pinguin', '--pinguin-grpc-address=127.0.0.1:50052'], message: 'configure receipts: Pinguin address and API key are required' },
      { flags: ['--receipts=disabled', '--pinguin-grpc-address=127.0.0.1:50052'], message: 'configure receipts: Pinguin fields require receipts=pinguin' },
      { flags: ['--receipts=smtp'], message: 'configure receipts: use disabled or pinguin' },
    ]) {
      assert.throws(() => execFileSync(binary, [...scenario.flags, `--database=${join(scratch, 'gallery.db')}`, `--public-root=${root}`, `--allowed-origin=${origin}`, '--cookie-name=gallery_test_session', '--tenant-id=gallery-test', '--owner-email=owner@example.test'], {
        env: { ...process.env, GALLERY_TAUTH_SIGNING_KEY: key, GALLERY_PINGUIN_API_KEY: '' }, stdio: 'pipe', timeout: 10000,
      }), error => error.status === 1 && error.stderr.toString().includes(scenario.message));
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
