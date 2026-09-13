# Repository Terminology

This file contains the approved technical nouns and technical verbs for repository documentation.

Use this file with `.mprlab/AGENTS.DOCS.md` and ASD-STE100 Simplified Technical English, Issue 9.

Do not add a general dictionary word to this file. Use the ASD-STE100 dictionary for general words.

Give each term one meaning. Use the same term for the same concept in all documents.

## MPR Lab Technical Nouns

- `acceptance criteria`: Conditions that show that a change has the necessary behavior.
- `active issue tracker`: The canonical file that contains current work.
- `ADR`: An architecture decision record.
- `adapter`: A code unit that connects a core module to an external system.
- `agent guide`: A file that gives binding instructions to an agent.
- `API`: A repository-owned application programming interface.
- `API contract`: The canonical schema and behavior of an API.
- `ASD-STE100`: The Simplified Technical English standard for technical documentation.
- `architecture`: The structure, boundaries, and ownership of a software system.
- `App Store Connect`: The Apple service that receives and manages iOS store artifacts.
- `artifact`: A file or image that a build, release, or generator creates.
- `backlog`: The set of unresolved issues in the active issue tracker.
- `backend client`: A code unit that sends requests to a backend.
- `browser frontend`: A user interface that operates in a web browser.
- `build`: A process or output that converts source code into an artifact.
- `changelog`: A file that records completed changes for releases.
- `characterization test`: An integration test that records current public behavior before a refactor.
- `CI`: The repository continuous-integration system.
- `CLI`: A command-line interface.
- `code path`: A sequence of operations in source code.
- `config`: Source-controlled configuration data.
- `container`: An isolated runtime package with an application and its dependencies.
- `contract`: A binding definition of behavior, data, or ownership.
- `credential`: A private value that an external service uses to authenticate an identity.
- `documentation`: Technical information in repository documents.
- `coverage`: Evidence that tests exercise specified behavior.
- `dependency`: An external or internal component that a system requires.
- `dependency injection`: A design that supplies a component's dependencies from outside that component.
- `deployment`: An operation that changes a runtime environment.
- `domain type`: A type that represents validated domain data.
- `EAS`: Expo Application Services for hosted build, submission, and update operations.
- `endpoint`: One HTTP API address and its operation.
- `end user`: The person who requests or receives the agent work.
- `environment file`: A private file that contains environment variable assignments.
- `environment variable`: A named process input.
- `Expo`: A framework and source config system for React Native mobile clients.
- `Expo CLI`: The Expo command-line tool for local development and native project generation.
- `file permission mode`: A number or symbol that gives filesystem access bits.
- `Google Play`: The Google service that receives and manages Android store artifacts.
- `GitHub Pages`: The GitHub service that hosts a static website from a repository branch.
- `issue`: One tracked unit of work.
- `issue tracker`: A file or system that contains issues.
- `integration test`: A test of real product logic and component interactions through a public entry point, with controlled dependencies when necessary.
- `inverted test pyramid`: The MPR Lab test strategy with integration tests as the primary layer and focused unit tests where useful.
- `language checker`: A tool that finds specified language errors.
- `language review`: An agent-owned examination of text against language rules and terminology.
- `manifest`: A source-controlled file that declares resources or configuration.
- `mobile client`: An application for a mobile platform.
- `mobile store artifact`: A signed `.ipa` or `.aab` file for store publication.
- `native toolchain`: The platform tools that build and sign a mobile store artifact.
- `payload`: Structured data that crosses a system boundary.
- `PDF`: A file that uses the Portable Document Format.
- `PRD`: A product requirement document.
- `private input channel`: A documented process environment, anonymous pipe, or private file input.
- `production code`: Source code that implements repository behavior outside the test suite.
- `producing agent`: The agent that creates or changes technical prose.
- `public entry point`: An interface through which a user or caller uses repository behavior.
- `pull request`: A proposed Git change for review and merge.
- `repository`: A source-controlled project and its files.
- `reference cache`: A private local directory that stores a verified official reference.
- `route`: An API or user-interface address and its handler.
- `runbook`: A technical procedure for an operator or agent.
- `runtime`: An operating instance of a service or application.
- `schema`: A machine-readable definition of structured data.
- `SHA-256`: A cryptographic digest that identifies the verified official reference.
- `source code`: Human-readable instructions that define software behavior.
- `source blocker`: A failure that prevents access to a necessary official source.
- `stack guide`: An agent guide for one language, framework, or runtime.
- `STE reference`: The verified official ASD-STE100 PDF that controls a language review.
- `store publisher`: A repository-owned tool that submits a mobile store artifact directly to its store.
- `static website`: A browser frontend that uses generated files without a website server runtime.
- `technical document`: A repository document that contains technical information or instructions.
- `technical noun`: A subject-field noun that the repository approves.
- `technical prose`: English technical text outside code and source-controlled literals.
- `technical verb`: A subject-field verb that the repository approves.
- `test-driven development`: A coding sequence that uses a failing integration test before a production code change.
- `unit test`: A test that isolates one code unit from its collaborators.
- `validation`: Evidence that a change obeys its current contract.
- `worktree`: A Git checkout that has its own working directory.
- `website hostname`: The hostname that identifies a public static website.

## Repository Technical Nouns

Add repository-specific technical nouns below this line.

- `CDN`: A content delivery network that serves public library assets.
- `migration`: A bounded change from an obsolete application contract to the current contract.
- `AAC-LC`: The audio codec profile selected for website music playback.
- `asset ID`: The SHA-256 identity of one immutable media package.
- `browser session`: An anonymous browser identity held in a cookie and server memory.
- `CORS`: The browser protocol that controls access to responses from another origin.
- `cookie`: A browser value that accompanies HTTP requests under specified scope rules.
- `fMP4`: Fragmented MP4, the container format selected for audio segments.
- `HLS`: HTTP Live Streaming, the protocol selected for website music playback.
- `media index`: A private file that maps track IDs to validated media packages.
- `media package`: One immutable set of audio segments, an initialization file, and an HLS playlist.
- `media service`: The application that authorizes playback and sends audio segments.
- `playback grant`: Temporary server authorization for one browser session and one media package.
- `rendition`: An encoded audio representation with a specified codec and bitrate.
- `segment`: One bounded audio part referenced by an HLS playlist.
- `track ID`: A permanent identifier for one catalog recording.
- `VOD`: Video on demand, the HLS playlist type used for completed audio recordings.

```text
- `term`: Definition with one meaning.
```

## Gallery Technical Nouns

- `artwork`: One visual work with a permanent identifier.
- `collection`: A permanent ordered group of artwork references.
- `exhibit`: A dated presentation with ordered artwork references.
- `Studio`: The proposed private interface for gallery content and orders.
- `checkout`: The buyer workflow that creates an order from selected sale offers.
- `master`: The private original image revision supplied with a purchased offer.
- `sale offer`: The price, license, availability, and file revision for one product.
- `entitlement`: A stored authorization to receive a purchased file revision.
- `webhook`: An HTTP event notification from an external provider.
- `lightbox`: A dialog that presents an artwork image.
- `mail sink`: A local service that records test email without external delivery.
- `original image`: The exact uploaded image bytes before preview generation.
- `gallery asset ID`: The SHA-256 checksum of one private original image.
- `ETag`: An HTTP validator that identifies a resource representation.
- `cursor`: An identifier that selects the next page of an API collection.
- `publication archive`: One reviewed catalog and its referenced public images, stored as a ZIP file.
- `SQLite`: The database engine that stores gallery drafts, assets, and orders.
- `database snapshot`: A complete database state from one transaction.
- `database backup`: A database snapshot kept for later recovery.
- `order access secret`: A random value that authorizes access to one buyer order.
- `access reissue`: A recorded request from the owner for existing buyer order access.
- `audit record`: Persistent data that identifies the owner, buyer, order, and time for an access reissue.
- `purchase snapshot`: The stored price, currency, license, and private revision selected for an order.
- `idempotency`: The property that a repeated request preserves the result of its initial execution.
- `payment capture`: The PayPal operation that requests the approved payment amount for the merchant.
- `provider reconciliation`: An examination of provider records to resolve an uncertain payment result.
- `refund`: A payment amount that the merchant returns to the buyer.
- `partial refund`: A refund for less than the full purchase amount.
- `reversal`: An operation through which PayPal returns all or part of a captured payment.
- `revocation`: A stored removal of authorization to receive a purchased file.
- `download grant`: A temporary authorization to retrieve one purchased file revision with its own access secret.
- `background worker`: A service task that processes stored operations outside an HTTP request.
- `retry schedule`: The stored times for subsequent attempts to process pending operations.

- `receipt`: An email record of a verified gallery purchase and its access instructions.
- `receipt queue`: The persistent gallery records that control receipt attempts and their status.
- `email delivery`: The process that sends an email to its recipient.
- `notification`: One message that Pinguin accepts for email delivery.
- `SMTP`: The email transport protocol that Pinguin uses for email delivery.

## Website Design Technical Nouns

- `content catalog`: The public site content stored in `data/site.json`.
- `canonical URL`: The selected public address of one page.
- `origin`: The scheme, hostname, and optional port of a URL.
- `path prefix`: The initial path segments assigned to one service.
- `route manifest`: The generated list of public pages and their artifact files.
- `slug`: A stable text identifier used in a public page path.
- `CommonMark`: The selected Markdown specification for article text.
- `OpenAPI`: The machine-readable description of HTTP operations and representations.
- `JSON Schema`: The machine-readable definition of JSON document structure and value constraints.
- `content digest`: The SHA-256 checksum of a complete public content catalog.
- `cutover`: The controlled replacement of the active application contract.
- `tenant`: An independent authentication configuration and identity scope in TAuth.

## MPR Lab Technical Verbs

- `archive`: Move completed history from the active issue tracker to durable storage.
- `authenticate`: Confirm the identity of a client or user.
- `authorize`: Confirm that an identity can do an operation on a resource.
- `build`: Convert source code into an executable or generated artifact.
- `cache`: Store a verified reference outside a target repository for repeated use.
- `commit`: Record a Git change in repository history.
- `configure`: Set source-controlled values that control system behavior.
- `deploy`: Change a runtime environment to use a specified artifact and configuration.
- `file`: Add an issue to the active issue tracker.
- `generate`: Create an artifact from its canonical source.
- `lint`: Use static rules to find source or document errors.
- `merge`: Add the changes from a pull request to its target branch.
- `normalize`: Change a file to obey one canonical format or contract.
- `parse`: Convert input data into a typed internal value.
- `publish`: Make an artifact available outside the source repository.
- `refactor`: Change code structure without a change to public behavior.
- `regenerate`: Create a generated artifact again from its canonical source.
- `redistribute`: Provide a third-party reference outside its approved distribution method.
- `render`: Convert source data into a visible or machine-readable output.
- `retrieve`: Get an official reference from its approved source.
- `review`: Examine an artifact against its requirements and record the result.
- `scan`: Use an automated process to find specified source patterns.
- `serialize`: Convert a typed value into a transport or storage representation.
- `validate`: Confirm that an input or artifact obeys its contract.
- `verify`: Confirm a result at its public or runtime boundary.

Use the simple present, simple past, simple future, imperative, or infinitive form of these verbs.

## Repository Technical Verbs

Add repository-specific technical verbs below this line.

- `revoke`: Remove stored authorization to receive a purchased file.
- `restore`: Create a database from a database backup for recovery.

```text
- `term`: Definition with one meaning and the approved verb forms.
```
