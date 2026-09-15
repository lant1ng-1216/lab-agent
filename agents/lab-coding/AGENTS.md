# AGENTS.md

Guidance for AI coding agents working in this repository. See
<https://agents.md/> for the file convention.

## Coding guidelines

These rules apply repository-wide. They are normative: **MUST** = required,
**MUST NOT** = prohibited, and **PREFER** = the default unless a concrete reason
justifies otherwise. Preserve the snapshot's behavior and compatibility contracts;
consistency with established project conventions beats introducing a second style.

## Lifetime and RAII

- **MUST** make it evident when every object and resource starts and stops existing.
- **MUST** bind files, sockets, processes, handles, locks, subscriptions, and
  library resources to move-only RAII owners. Destructors must be safe,
  deterministic, and non-throwing.
- **PREFER** automatic storage and the Rule of Zero. Do not use manual cleanup or
  process exit as resource management.
- **MUST NOT** return or retain a pointer, reference, iterator, span, view,
  callback, or coroutine state that can outlive its referent.
- **MUST** give every asynchronous task, timer, callback, process, and subscription
  an owner plus explicit completion and cancellation paths. No detached work.
- **MUST NOT** capture local references in asynchronous callbacks unless completion
  before scope exit is structurally guaranteed.
- **MUST** declare members so reverse destruction order is safe when one member
  depends on another.

## Ownership

- **MUST** give every resource one identifiable owner unless shared lifetime is an
  essential domain requirement.
- **PREFER** values. Use `std::unique_ptr` for exclusive dynamic or polymorphic
  ownership.
- **MUST NOT** use `std::shared_ptr` to avoid deciding ownership. When independent
  shared owners are necessary, document why and break cycles with `std::weak_ptr`.
- **MUST** treat raw pointers and references as non-owning. Never delete through
  them or assume they extend lifetime.
- **MUST** express ownership transfer in the type: factories return values or
  `std::unique_ptr`; consuming parameters take a value or `std::unique_ptr`.
- **MUST NOT** store borrowed data unless the owner's longer lifetime is both
  guaranteed and locally obvious.

## Copying, movement, and borrowing

- **MUST** make value flow clear in every interface:
  - small, cheap values: pass by value;
  - required borrows: `T&` or `const T&`;
  - nullable borrows: `T*`;
  - call-bounded contiguous/text views: `std::span` or `std::string_view`;
  - values retained by the callee: accept by value and move into place;
  - explicit ownership transfer: `std::unique_ptr<T>`.
- **MUST NOT** persist a span or view unless the containing type encodes and
  guarantees the backing storage lifetime.
- **MUST** use `std::move` only for intentional transfer. After a move, only
  destroy, reassign, or perform operations guaranteed for the moved-from state.
- **MUST** avoid accidental copies in loops, structured bindings, callbacks,
  variants, and return paths. Keep inexpensive copies when they make code clearer.
- **MUST** explicitly default or delete copy/move operations for resource-owning
  types when the Rule of Zero cannot apply.
- **MUST NOT** return `const` values; it obstructs movement without adding safety.

## Modeling data

- **PREFER** values, enums, and `std::variant` over classes with optional fields or
  mode booleans. Make illegal states unrepresentable when that improves clarity.
- **MUST** handle variants and state enums exhaustively so adding a case produces a
  compile error at every required decision point.
- **PREFER** strong types for identifiers, paths, units, money, token counts, and
  states that would otherwise be easy to confuse.
- **PREFER** immutable values. Keep mutation narrow, deliberate, and protected by
  an invariant.
- **MUST** validate external input once at its boundary, then preserve the validated
  invariant internally.

## Compile-time and zero-cost abstraction

- **PREFER** values, templates, concepts, `constexpr`, enums, and `std::variant`
  when behavior is known at compile time and the result remains readable.
- **MUST** use runtime polymorphism only at genuine runtime boundaries such as
  providers, storage backends, platform services, frontends, and integrations.
- **MUST NOT** add allocation, virtual dispatch, type erasure, reference counting,
  or synchronization unless the required runtime flexibility justifies it.
- **MUST** keep templates small, constrained, and domain-named. Do not create a
  generic framework before the shared invariant and variation points are known.
- **MUST NOT** use macros for ordinary abstraction. Contain unavoidable platform,
  build, and feature macros at narrow boundaries.
- **MUST** verify performance-sensitive zero-cost claims with an optimized build,
  compiler output, or a benchmark—not intuition.

## Abstractions and classes

- **MUST NOT** introduce an abstraction unless it materially improves readability,
  flexibility, correctness, or maintainability. If direct code is clearer, use it.
- **MUST NOT** use a class when a value or function suffices. A class must have an
  identity or resource, mutable state, an invariant to protect, and behavior.
- **MUST** name the invariant protected by a class. If no invalid instance state can
  be described, prefer a value type or free function.
- **MUST NOT** perform I/O or expected-failure work in constructors. Use a named
  factory returning `Result<T, E>` when construction can fail.
- **PREFER** composition over inheritance. Use inheritance only for genuinely
  substitutable runtime behavior.
- **MUST** keep public surfaces minimal; implementation details remain private.

## Functions and dependencies

- **MUST** keep functions cohesive and side-effect-free where practical. Push I/O
  and mutation to adapters and keep domain transformations pure.
- **MUST** inject clocks, IDs, filesystems, processes, transports, stores, and other
  external capabilities. Do not construct them inside domain logic.
- **MUST** define dependency interfaces from the consumer's view and expose only
  the operations that consumer needs.
- **PREFER** returned values and typed events over mutation of distant shared state.
- **MUST NOT** use service locators, hidden global state, or implicit environment
  reads in domain code. Resolve configuration at the composition root.

## DRY and modularization

- **MUST** keep one authoritative representation of each rule, invariant, protocol,
  and piece of domain knowledge.
- **MUST NOT** extract superficial repeated syntax when doing so hides intent,
  couples unrelated modules, or creates flags and branches. DRY applies to
  knowledge, not every repeated line.
- **MUST** organize modules around cohesive responsibilities and stable boundaries;
  each module should have one clear reason to change.
- **MUST** keep domain logic independent of UI, transport, storage, platform, and
  third-party SDK types. Convert representations at adapter boundaries.
- **MUST** keep dependencies acyclic and inward: delivery/adapters → application →
  domain. The domain must not import an outer layer.
- **MUST NOT** create `utils`, `helpers`, or `misc` grab-bags. Name modules after
  their domain responsibility.
- **PREFER** a helper beside its only caller. Share it only when cohesive callers
  depend on the same semantics rather than merely similar syntax.
- **MUST** avoid both oversized files that mix concepts and tiny fragments that
  force readers to cross many files to understand one operation.

## Naming and comments

- **MUST** use precise domain names that expose purpose, units, ownership, and
  state. Prefer `request_timeout` to `timeout` and `message_count` to `count` when
  the distinction matters.
- **MUST NOT** use unexplained abbreviations, single-letter names outside tiny
  conventional scopes, or vague names such as `data`, `manager`, `helper`, and
  `util` when a domain name exists.
- **MUST** keep terminology consistent across code, tests, logs, documentation,
  wire formats, and user-facing concepts.
- **MUST** write comments for rationale, invariants, ownership/lifetime assumptions,
  compatibility constraints, and non-obvious tradeoffs—not to narrate syntax.
- **MUST** update or remove comments when behavior changes. A stale comment is a
  defect.
- **MUST** document public-interface ownership, borrowing lifetime, executor/thread
  affinity, cancellation, ordering, and errors when the types do not make them
  obvious.
- **MUST** cite the authoritative behavior or fixture beside byte-level, ordering,
  or compatibility code that a future cleanup could accidentally break.

## Locality and orthogonality

- **MUST** keep related state, invariants, transformations, and error handling near
  one another. Declare and initialize variables in the narrowest useful scope.
- **MUST** handle errors at the layer with enough context to act. Do not repeatedly
  catch only to log and rethrow.
- **MUST** isolate platform code, third-party types, serialization quirks, and
  compatibility shims behind narrow adapters.
- **MUST** keep components independently understandable, testable, and replaceable.
- **MUST NOT** combine model conversion, domain decisions, permissions, tool
  execution, persistence, and presentation in one object.
- **MUST** model independent dimensions independently. Avoid boolean clusters and
  modes that create invalid combinations.
- **MUST** use typed events/results across subsystem boundaries, not callbacks that
  mutate another subsystem's internals.
- **MUST** ensure adding a provider, tool, command, backend, or frontend does not
  require unrelated edits across the repository.

## Errors and invariants

- **PREFER** typed `Result<T, E>` values for expected operational failures. Reserve
  exceptions for programming errors and library boundaries where exceptions are
  the natural contract.
- **MUST** model domain failure modes in the return type and preserve original
  context while adding actionable domain context.
- **MUST NOT** ignore an error without an explicit reason. Destructors must not
  throw.
- **MUST** use assertions only for programmer invariants, never input validation or
  behavior required in release builds.

## Verification

- **MUST** test success, expected failure, cancellation, early return, partial
  initialization, shutdown, boundary values, ownership transfer, and compatibility
  behavior relevant to the change.
- **MUST** run formatting, warnings-as-errors, focused tests, and relevant ASan/
  UBSan builds before declaring C++ work complete.
- **MUST** use byte golden tests—not parsed-value equality—for byte-compatible JSONL
  behavior.
- **MUST** review every stored reference and asynchronous callback for lifetime,
  every resource for one clear owner, and every interface for explicit copy/move/
  borrow semantics.
- **MUST NOT** approve code merely because it compiles or passes a narrow test.

## Meta

- **MUST** prefer an established convention over introducing a "better" second one.
  Predictability is the point.
- **MUST** delete an abstraction when removing it makes the code easier to read,
  change, and verify without losing a real invariant.

## Git/PR Workflow
- Recent human commit format: (type) imperative summary.
- Examples from this repo: (feat) add deployment script, (fix) add shebang to index.ts for execution in github actions, (chore) bump cli version.
- AI-created commit format when the user asks for a commit: (type) (openai/gpt-5.5, reviewed T|F, tested T|F) imperative summary.
- Before creating an AI commit, ask the user whether a human reviewed the changes so reviewed T|F is accurate.
- Mark tested T only after the relevant checks have run successfully. Otherwise use tested F.
- Before committing, inspect git status --short, git diff, and git log --oneline -10; stage only intended files.
- Run git diff --check before commit/PR handoff.