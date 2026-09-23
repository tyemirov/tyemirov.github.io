# Gallery Operations

## Current Status

F002 is closed for implementation on September 23, 2026.
The owner accepted the site design after review.
The implementation record reports passing Studio, purchase, delivery, recovery, and local orchestration tests.
Those tests use automated browsers and local provider implementations.
Site design approval does not establish live provider acceptance.

## Pending Operations

- Verify the production Google, TAuth, PayPal, and Pinguin configuration.
- Verify the exact website origin in the Google provider configuration.
- Complete a PayPal sandbox purchase through the gallery.
- Verify the payment event, purchased file bytes, link expiry, access renewal, and refund revocation.
- Qualify actual receipt delivery through Pinguin and the selected sender.
- Confirm the sale masters, prices, license, refund terms, and support address.
- Create a sealed release that includes the gallery service and website artifacts.
- Complete the operator-controlled publication and deployment.
- Verify the published release, HTTPS routes, owner sign-in, and retained data.
- Qualify production backup recovery through the documented backup and restore commands.
- Activate sales after the provider and content requirements are completed.

These operations remain pending until their own evidence records show completion.
They are separate from implementation issue closure under the current repository policy.
No production operation was performed during this acceptance-record update.

## Evidence

- [Redesign Implementation Record](redesign-implementation.md): implementation boundaries and recorded code validation.
- [Homepage And Gallery Validation](homepage-gallery-validation.md): local workflows and historical provider observations.
- [Gallery Operating Plan](../gallery/OPERATING-PLAN.md): product workflow and sale decisions.
