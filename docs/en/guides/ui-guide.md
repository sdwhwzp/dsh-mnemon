# Sidebar and Conversation UI Guide

[简体中文](../../zh-CN/guides/ui-guide.md) | **English** | [Documentation hub](../README.md)

The default entry is Sidebar. Optional Builtin placement embeds the same pages in a conversation. v0.5 keeps the familiar workflow and adds a main Strategy choice and three Memory enhancement switches, not a View page or generic plugin manager. All configuration is on the `dsh-mnemon` page under **Plugins**, where DSH 0.1.7 keeps plugin settings. The interface uses the DSH theme tokens and component specifications: buttons, switches, selectors, tags, status dots and dialogs match DSH's own pages, and the configuration is organized as DSH preference rows.

## See it in use

Screenshots below show the released **v0.5.4** interface in **Light** appearance, after importing a Mnemon Pack into a disposable local DSH environment. The imported data includes 20 Runtime entries, 12 Documents and four Memory Spaces, two active. Interface labels use **memory space / 记忆空间**; the original Chinese record content remains Chinese in both locales. [Capture details and limits](../../assets/webui-v0.5.4/README.md).

[Watch the 42-second Light demonstration](../../assets/webui-v0.5.4/en/demo.mp4): browse imported spaces, open and cancel drafts, retrieve evidence, inspect the graph, and check npm guidance and subpackage versions. The [full bilingual gallery](../../assets/webui-v0.5.4/README.md) also covers settings, backup import and narrow layouts.

Older media remain available with their original version labels in [historical evidence](../../pr-assets/README.md).

## Interaction model

The Memory System sidebar entry uses the same native DSH row as Plugins, including its skin, selected state and collapsed icon. Selecting Plugins, another native panel or New Session leaves the memory workspace; Back to conversation and Escape return to the current conversation. Clicking Memory System again keeps its current page open, and returning after Task Board or SSH restores it.

With `displayMode: builtin`, open Memory System from the conversation's tabs instead; the Sidebar entry is absent. The header omits storage-scope and workspace-selection controls because the Host uses the owning session's global, workspace, centralized workspaces or custom scope. All Source pages and dialogs below are shared, and conversation shortcuts open the matching tab. See [scope mapping](../reference/configuration.md#entry-placement-displaymode-and-tabenabled).

While Memory System is displayed in Builtin, its owning conversation's width resize handles are hidden. The resident composer remains usable; switching to Chat or another view restores normal width dragging. This applies only to the owning conversation, including when other plugins render adjacent or nested conversations.

Primary pages remain **Status, Runtime memory, Project Documents, Memory Spaces**: each Source's page carries the name its component declares, as the configuration shows it, and an installed Source's page joins them the same way. Memory Spaces adds **Overview, Recall, Content, Entities**, with **Remember** and **Distillation strategy** at the top right. A generated View is an internal per-turn runtime artifact, not a navigation page; Status does not own plugin discovery or installation.

All four pages use the same content inset and one page scroll area. Their primary headers remain visible while scrolling; Memory Spaces keeps its title, actions and internal tabs together. Changing a primary page or a Memory Spaces tab starts at the top without moving the conversation or other plugin panels. Opening related memories reveals their heading and close button below the fixed header. Document readers, related-memory readers and dialogs retain their own bounded scrolling.

| Visible action | What happens after the click | Independent task Agent? |
|---|---|---|
| Refresh status, synchronize now, click a Memory Space card | The Host reads asynchronously; one region spinner or the card's state dot shows progress | No |
| Choose a main Strategy or toggle a Memory enhancement | Switch how future turns compose memory, or enable or disable one shipped behavior | No |
| Direct search, browse Content, inspect Entities | Provider-native read contracts run concurrently and render progressively | No |
| Agent query | Recall runs first; bounded evidence goes to a clean top-level task Agent | Yes, read-only |
| Remember / Save to memory | An editable confirmation precedes qualification, deduplication, distillation, routing, and writing | Starts after confirmation |
| AI metadata | Each space samples quickly and generates independently; one failure remains on its card | Yes, isolated per space |
| Archive | A searchable cold reference is created before the Host moves the original | Starts after confirmation |

## 1. Status: establish readiness

![Current status and Native readiness](../../assets/webui-v0.5.4/en/status.jpg)

The top Memory Engine area shows only dsh-mnemon. The Memory providers list shows Mnemon Native as its first row (while its CLI is installed or a Native space exists), followed by the other Providers with enabled, health, and connection state. A failure is marked on its own row and never becomes a global banner.

The page loads concurrently and progressively. Only one region-level spinner remains while work is pending; returned data appears immediately. After the engine, every Source component has a card named as it declares itself: what it contributed (Runtime memory's entries, Project Documents' active and archived documents, Memory Spaces' active spaces), or that it runs, for an installed Source that contributed nothing. Status also shows the storage root, whose areas carry the same names, and dsh-mnemon / Mnemon versions. The header names the composing main Strategy the same way.

A notice above the pages, with **Open configuration**, says when memory needs attention: **Memory not in use** while no main Strategy runs (conversations continue without memory), **The latest component change did not take effect** while a rejected change leaves the previous composition serving, and **The selected main strategy is not running** while a fallback Strategy composes. A layer card whose layer is off, whose Source component is off, or that nothing composes says so instead of waiting for data.

### Check versions

![npm guidance for the detected CLI installation](../../assets/webui-v0.5.4/en/versions.jpg)

Checking is read-only. Mnemon CLI distinguishes missing, unreadable, current, and update-available installations, with npm install, migration, or update commands that can be copied. Registry failures leave local installation guidance visible. Commands run on the DSH Host; verify the executable path after installing or changing PATH.

Expand **Subpackage versions** under dsh-mnemon to inspect Sources, Strategies, and Providers. Each row shows installed and published versions, the Starter pin where applicable, and its maintenance method. Starter dependencies update with the Starter's tested combination; packages installed independently in the current Profile can update individually. Source links show local build instructions. Page updates require management access and `writeEnabled`; version checks and command copying remain available in read-only mode. Restart `dsh web` after package updates; the restart reminder remains on subsequent checks.

## Memory enhancements: expose stable behavior only

![Default memory layers and three optional enhancements](../../assets/webui-v0.5.4/en/enhancements.jpg)

There is no standalone View page, and Status exposes no plugin catalog, dependency graph, or installation flow. Memory is composed on the `dsh-mnemon` page under **Plugins**, in one **Memory composition** board drawn from what the installed components declare. Shipped components and installed extensions are named, related and configured the same way:

- **Main strategy** is one selector, whatever the number installed, listing each main Strategy with its description. The Starter ships the **Layered strategy** (Runtime memory resident, Documents and Memory Spaces read on demand, with the automatic maintenance of earlier releases) and **General strategy** (every available Source in one budget; the model decides how to use each one, without automatic review or capacity maintenance);
- one group per role the other components declare, with a count of the switches that are on: **Memory sources**, **Enhancements**, and a group of its own for any new role. Each row has the component's name and description, its state as DSH's component list shows it, a gear when it has settings of its own, and its switch; the gear and the name open its page. Link chips name the components a row relates to, the one it needs or the one that depends on it, and open their pages. Enhancements written for another main Strategy wait in a closed group;
- a problem line appears only while memory is not composed as chosen, with the one switch that fixes it: turning the selected main Strategy back on, using the one that stands in for it, turning off a second main Strategy left running unused, or turning on a Source when none runs;
- once many components are installed, a search filters the rows by name, description or package.

Every switch applies at once to future turns; it never rewrites a turn that already pinned its View. Turning a component on also turns on what it needs and turns off what cannot run beside it (two components claiming the same capability or enhancement slot); turning one off also turns off what depends on it; choosing a main Strategy turns the others off, with whatever only they could take. The last running Source stays on. While the selected main Strategy is not running, the other switches wait, because the Host validates every change against it. A switch that moves only its own row says nothing more; one that moved other components, switched the main Strategy or changed what composes memory is reported in a DSH toast with **Undo**; a change made elsewhere, such as DSH's component list further down the page, with **Show**; a refused one with **Retry**.

A component's page opens from its gear, from the gear beside **Main strategy** (the selected Strategy's page), and from the component's name wherever it appears: a row, a chip, a Storage chip, or a name on another page, which opens in place with **Back**. The page shows its state and switch, whether it ships with dsh-mnemon or came from an installed package, what it needs, what depends on it and what cannot run beside it, what its switch would also move, its options, and the settings it contributes. Options come from the component's own field declarations (numbers, text, lists and Source choices) and are checked against the limits the Host applies; **Apply** appears once one changes, and the page stays open after it. An option left at its default is not written, and **Reset to default** puts one back. Third-party Sources and Strategies install through DSH's Plugins list and appear on the board once loaded; see [Building Memory Plugins](../development/extensions.md) for how their declarations and contributions shape it.

## 2. Runtime: maintain every-turn context

![Runtime totals and two imported User Profile entries](../../assets/webui-v0.5.4/en/runtime.jpg)

The header summarizes User Profile (`USER.md`) and Working Memory (`MEMORY.md`). A shared card style lists items below. Filter by source, text, category, and importance; clicking the current filter again never breaks the page. Long fields truncate within their own block and reveal the complete value on hover.

Runtime entries display their creation time, newest first, across both targets and text filters. Editing an older entry keeps its original position. Show more continues in the same order.

The model-facing Runtime snapshot also shows each projected entry's recorded importance and age since creation and last update, in whole days. These annotations are calculated for each new turn; stored text and the editor remain unchanged. Current instructions still take priority. See [projection format and limits](../reference/storage-model.md#source-of-truth-and-projections).

Edit and Remove select the entry's full content within its target. A short entry such as `X` can be changed or removed while `EGO_LINUX_CHROME` remains intact. Identical entries in the same target are still ambiguous and are rejected without changing data.

When Working Memory reaches capacity, the Host archives the exact original entries. If a routing batch fails or returns an invalid proposal, that entire batch uses the eligible default Memory Space (or the first eligible space when no default is available). Earlier valid batches keep their destinations, and the maintenance summary records the fallback reason. Caller cancellation still stops the operation.

Spaces created by the current conversation View, or known spaces activated during that turn, can receive the archive once active and supported. Spaces created elsewhere after the turn began require a new turn. A destination failure explains the directory or scope restriction and leaves existing Runtime entries intact; the pending add has not been saved, so retry its original input after correcting the cause.

Runtime items should be compact, independent, and repeatedly useful. Working Memory items can carry an optional branch scope (comma-separated git branch names in the add and edit forms): scoped items show a branch badge and are projected into the model context only while the session workspace is checked out on a listed branch; leaving the field empty keeps an item visible on every branch. The scope never affects this page or the on-disk `USER.md`/`MEMORY.md` projections. Identity, preferences, and explicit collaboration rules belong in User Profile. Project facts, environment, decisions, and tool lessons belong in Working Memory. Temporary progress and raw logs do not.

When the agent uses `mnemon_runtime_memory` for User Profile (`target=user`), `branches` may be omitted or supplied as `[]`. Non-empty branch scopes remain invalid for User Profile. For Working Memory, replacing an entry with `branches: []` clears its scope; omitting the field preserves it.

## 3. Documents: preserve complete project narratives

![Imported project document directory and Markdown reader](../../assets/webui-v0.5.4/en/documents.jpg)

Select a DSH workspace first: Documents needs a workspace identity even with global/custom storage. A selected conversation supplies its workspace; Workspace storage also allows explicit inspection selection. This identifies the project without changing the selected storage root.

Switch between active and archived directories. Repeatedly clicking the selected entry keeps it selected; it never closes the reader. The right pane preserves title, retrieval description, provenance, revision, hash, size, and full Markdown, and resets to the top when selection changes.

Active and archived lists, including search matches, display creation dates and sort newest first before loading more documents. Updating an older document does not move it to the top.

For explicit archive or foreground capacity maintenance, an independent task Agent proposes a summary and one existing eligible Memory Space. It has no memory tools. The Host validates the proposal, adds the exact cold path and content hash, stores the index and builds lineage from its own receipt before moving the original. The destination must be active and support exact writes and safe forget; configure a suitable space before archiving.

An invalid proposal leaves both the active document and Memory Spaces unchanged. If moving the document fails, the Host attempts to remove only the newly created index. Existing verified indexes are reused and never deleted by this cleanup. If cleanup fails or the Provider outcome is uncertain, inspect the reported destination and index before retrying; this is compensating cleanup, not a cross-Provider database transaction.

Background review preserves existing document bodies. It searches first, skips covered candidates, and creates a separate supplementary document only for substantial new knowledge. It cannot update or archive existing documents; if capacity is exhausted, it skips creation. Normal explicit edits remain available.

Review reuses complete overviews, file excerpts, rules, and tool results already inherited from the completed conversation. It cannot reopen files or call another plugin's overview tools. Missing evidence permits a bounded Document search; if that is insufficient, review skips the candidate.

Title and retrieval description determine discoverability, source path preserves provenance, and the body keeps Markdown structure. Source project files remain read-only; the workbench creates a managed copy.

## 4. Memory Spaces: one replaceable third tier

### Overview and live snapshot

![Four imported Memory Spaces with two active](../../assets/webui-v0.5.4/en/spaces.jpg)

Read the live snapshot in two layers from top to bottom:

- Each **Snapshot visibility** card represents one active Memory Space and declares the read surface, projection mode, and observable count its Provider can actually supply. `Real graph`, `Content projection`, and `Query only` are capability boundaries, not quality levels.
- The **Live multi-memory snapshot** merges those readable results into one relationship graph. Edge colors distinguish space ownership, temporal, semantic, causal, and entity-association links, while Provider and Memory Space labels preserve provenance.
- The lower left reports total spaces, memories, and entities; the lower right reports currently rendered elements and connections. A value such as `60 / 129` is an interactive rendering window, not missing data.
- Select a Memory Space, entity, or memory node to inspect its exact context on the right. Natural layout, dragging, and even reset change presentation only; they never rewrite Provider data.

![Live graph from the two active native spaces](../../assets/webui-v0.5.4/en/graph.jpg)

Each card represents a real space. Provider tags use color without duplicating icons inside tags; `Mnemon Native` appears as `mnemon` in the catalog. Click a card to reconnect only that Provider + ID. During reconnect, its state dot becomes an equal-size spinner; no global synchronization runs.

The first Overview visit performs one full synchronization. Later refreshes are on demand. **Synchronize now** remains at the top right beside elapsed time since the last full sync.

Snapshot visibility declares the read surface each space can actually honor before rendering the combined graph:

- Mnemon Native supplies full typed relationships;
- Hindsight and Holographic contribute their real graphs;
- providers without edges contribute content projections only;
- query-only providers such as ByteRover wait for an explicit query.

The UI never fabricates unsupported relationships, entities, deletion, or browse capability.

### Create a Memory Space manually

![Create a named memory space with a Provider](../../assets/webui-v0.5.4/en/space-create.jpg)

Clicking Create always asks the user to choose a Provider explicitly. Only services enabled on the `dsh-mnemon` page under **Plugins** appear. Provider-specific fields use a vertical layout to avoid alignment drift. The new instance enters catalog, activation, and recall only after creation.

### Distillation strategy: manual or smart

Distillation strategy routes later Agent writes; it does not change manual creation:

- **Manual** uses an explicitly constrained target. Until one is saved, it uses the first ready Provider: Mnemon Native while its CLI is installed, otherwise another enabled Provider;
- **Smart selection** treats data boundary and required capabilities as hard rules, then uses local/shared preference and a prompt as soft policy. A model runs only when several candidates remain eligible.

The receipt keeps decision source, confidence, and reason. Provider credentials never enter model context.

### AI metadata

Select several active spaces. Each task uses that Provider's fastest native query to fetch a small sample, then follows system-prompt length and capability constraints for title and description. Tasks share no state; a failure appears only on its card. If a model-generated title or description fails the local length check, that card keeps its previous metadata while valid results still update. The dialog stays open and each card plays a rightward same-tone refresh animation before updating in place.

Generated title and description are local catalog metadata and survive ordinary reconnects. Disabling a Provider clears mapping and metadata. Re-enabling rebuilds them from Provider data, using the closest default only for unmapped fields.

### Remember

Normally, provide only a candidate. Confirmation starts a clean task Agent to qualify, choose the narrowest space, deduplicate, distill, and write. Manual advanced options are for genuinely required target, category, or importance constraints.

### Recall and Agent Query

![Keyword recall of an imported record](../../assets/webui-v0.5.4/en/recall.jpg)

- **Direct search** returns raw evidence without an Agent.
- **Agent query** uses the same evidence, then starts an evidence-only top-level task Agent.
- Providers return concurrently; one connection failure never hides other sources.
- Rank fusion orders providers while retaining engine-native score, ID, space, Provider, and category.
- Related, Link, Browse, and Forget appear only when genuinely supported.

Focused questions are usually more reliable than broad keywords.

### Content and Entities

![Native evidence with provenance](../../assets/webui-v0.5.4/en/content.jpg)

Content distinguishes enumerable, query-only, and unavailable surfaces. A Provider tag both applies a filter and clears it when clicked again. Entities aggregates only real indexes—currently Mnemon Native, Hindsight, and Holographic—rather than inferring capability from ordinary text.

The [entity view](../../assets/webui-v0.5.4/en/entities.jpg) shows the same imported evidence connected through its native APPSO entity index.

### Narrow layouts

The 390 × 844 captures cover [directory navigation](../../assets/webui-v0.5.4/en/spaces-mobile.jpg), [long-name cards](../../assets/webui-v0.5.4/en/space-directory-mobile.jpg), the [creation sheet](../../assets/webui-v0.5.4/en/space-create-mobile.jpg) and [version maintenance](../../assets/webui-v0.5.4/en/versions-mobile.jpg). Long card names and some metrics truncate at this width. These browser captures do not establish complete phone or Host-settings compatibility; see [known limits](../reference/compatibility.md).

<a id="5-settings-services-are-not-memory-space-instances"></a>

## 5. Configuration: services are not Memory Space instances

DSH 0.1.7 edits a plugin's configuration on its own page under **Plugins**; Settings keeps DSH's own sections and the read-only plugin inventory. Open **Plugins → dsh-mnemon**, which the Chinese interface titles 可组合记忆, or select **Configure** (the gear) in the Memory System header while the Plugins page is available. The page shows the plugin's title and description, the configuration, and then the components the Starter includes, each under the name and description it declares. A component's name in that list opens DSH's page for it, which carries the same component page as the board: its state and switch, relations, options and its own settings, with related components opening over it. **Open Memory System** at the head of the page leads back to the workspace.

The configuration uses DSH preference rows: a name and description on the left, a selector, switch or button on the right. It keeps what belongs to no component; each component's own settings are on its page:

| Where | Contains | Applies |
|---|---|---|
| Memory composition | Main strategy, one switch per memory Source, one per enhancement | At once, to future turns |
| Storage | Storage scope, Data directory, Backup and migration | Scope and directory with their **Apply**; ZIP import and export at once |
| Interface | Memory System opens in (Sidebar / Conversation tab), Turn memory bar, Save to memory action | At once |
| Runtime Memory's page | User profile scope | At once |
| Memory Spaces' page | Memory providers and the Mnemon Native embedding | Switches at once; typed connections with their **Apply** or service form |
| Layered strategy's page | Task Agent model, Idle review | Choices at once; review limits with their **Apply** |

Switches and selectors apply when they change, and show the saved value again beside the reason if a write fails. Typed values wait for their group's **Apply**, which appears once something changed. A save from another window, or an edit of the profile, shows up without a reload. Health belongs on Status and instances belong on Overview; the configuration never waits for discovery or recall.

- **Storage** names the components that keep their data in its directory; each opens its page.
- **Storage scope** is Global, Workspace, or Centralized · isolated by workspace. Its Apply line says what applying does: memory reads and writes the new location, and existing data is never migrated, merged or deleted.
- **Data directory** is **Default** or **Custom**, and shows the one directory memory uses. **Default** is `MNEMON_DATA_DIR` or `~/.mnemon`, shown under the title; with Centralized, the title shows this workspace's directory under the default root instead. **Custom** opens a field for an absolute path or one starting with `~/`: with Global, the directory itself (the `custom` scope in configuration, an explicit-path global scope); with Centralized, the central root, where each workspace keeps its data in `workspaces/<workspace-path-hash>/`. An empty field is not the default: it waits for a path, and **Default** is chosen on its own. Workspace needs no directory and shows the workspace's `.mnemon`.
- **User profile scope**, on Runtime Memory's page, is independent: **Shared globally** combines global USER.md with workspace/custom MEMORY.md without moving either source.
- **Backup and migration** exports or imports the current data directory as a ZIP with the components Storage names (Runtime memory, Project Documents and Mnemon Native memory spaces), without third-party Provider data or credentials.
- A memory layer and the Source component serving it share one switch; “on” permits on-demand use and does not force Recall on every turn. A layer an earlier configuration turned off comes back on through the same switch. When the components cannot be read, the board still lists the saved layers and switches them.
- Memory providers are on Memory Spaces' page and are read while it is on; otherwise the page says to turn it on with its own switch, the same switch as its row in Memory composition. While dsh-mnemon is read-only (`writeEnabled: false`), Provider switches are disabled with that reason.
- Provider cards match DSH's model provider cards. Mnemon Native is the first card and, when expanded, holds only the local embedding settings it alone reads. Every third-party Provider has its own switch and is off by default; endpoint, API Key, and Provider-specific fields appear only after enabling.
- The Global / Workspace tag on each card shows its effective scope; Providers with the same scope semantics reuse Mnemon's configuration framework.
- OpenViking's optional **User key owner (skip admin)** field selects one user namespace for keys without Admin API access; fill the account and user key as well. A rejected data-plane check leaves the previous service configuration unchanged. [Setup and limits](./memory-providers.md#operational-boundaries);
- API Keys use a conventional password field whose eye button toggles visible/hidden; there is no clear-credential checkbox, dedicated Remove row, or saved-secret caption.

### Mnemon Native embedding bridge

Expand the Mnemon Native card on Memory Spaces' page. **Manage embedding settings in DSH** applies at once and makes the saved endpoint, model, protocol and optional API key authoritative for Mnemon child processes, including Desktop launches that do not inherit shell startup files; while it is on, those fields appear and apply together with their **Apply**. Automatic protocol selection treats an endpoint ending in `/v1` as OpenAI-compatible; other compatible endpoints require explicit protocol selection. The URL rejects embedded credentials, queries and fragments. Memory and query text are sent to the configured service. **Test status** checks saved values, not an unsaved draft. See [embedding configuration and safety](../reference/configuration.md) before enabling it.

Switching a memory layer off does not delete data. Its Sidebar tab remains visible with an Off badge and opens a reversible disabled-state explanation without reading the data plane; re-enabling restores the existing data. A layer whose Source component is off keeps its tab and place, marked **Not running**, and every layer is marked **Not in use** while no main Strategy runs; each page explains why, links to the configuration, and returns to the layer's own page once the Source runs again. Source management and assistance refuse a layer that is off. A newly contributed extension Source starts disabled. The current runtime generation keeps serving until the candidate validates and swaps, so a rejected candidate never leaves a partial configuration active.

### Task Agent model

On the Layered strategy's page, under Background tasks, **Task Agent model** set to **Follow the main route** uses DSH's default for a new session. **Choose a model** applies at once with DSH's default route and shows the model provider and model selectors; each applies when chosen, a Provider starting from its first model, and two Providers with the same name show their ids. The route is always a complete Provider + Model pair. It affects AI metadata, Agent Query, Remember, smart Provider selection, and Document archive only; it never changes the current main conversation model. Reasoning strength depends on both selected Provider capability and DSH route support.

The picker displays the capabilities reported by DSH. An **Image input** label describes the selected model's capability; current Mnemon background jobs still send text-only prompts.

Switches, selector options, and eye buttons tolerate repeated clicks—including choosing the already-selected value—without unmounting or blanking the page.

## 6. In-conversation interaction

### Turn memory

Turn memory appears only on completed turns with memory activity. Expand or collapse it repeatedly. Clicking an exact tool opens its matching Recall, Content, Entities, or Documents page.

### Save to memory

Save to memory sits in the native action strip for finalized replies. The first click only reads that reply and opens an editable dialog. Cancel has no data effect. Only **Confirm and send to independent task Agent** starts distillation.

Both conversation controls are on by default and can be changed independently under **Interface** on the `dsh-mnemon` page under **Plugins**. Saving applies live.

In Builtin mode, automatic shortcuts require one unambiguous Memory System tab in the main conversation. If split panes expose multiple eligible conversation tabs, the shortcut stays pending; open Memory System in the intended conversation manually. Each Builtin view retains its owning session.

## Workspace mode: inspection and execution are distinct

| Concept | Selected by | Affects |
|---|---|---|
| **Inspected workspace** | Workbench header selector | Which `<workspace>/.mnemon` the UI displays and maintains manually |
| **Effective workspace** | Current conversation / Agent cwd | Which root conversation tools, commands, and lifecycle hooks use |

You may inspect project B while staying in project A's conversation. The conversation Agent remains on A; AI metadata, Agent Query, Remember, and Document archive launched from the workbench create clean task Agents explicitly scoped to B. This works even when no main session is selected.

Remote Provider workspaces, users, banks, projects, containers, and URIs are independent namespaces and never change implicitly with the DSH workspace. `global` and `custom` resolve to one explicit root and need no inspection/execution alignment.

<a id="theme-skin-overrides"></a>

## Theme and skin overrides

Skin authors can start with [Skin development and Mnemon integration](../development/skin-integration.md) for a dsh-web example, migration from generated classes and real WebUI verification. This section defines the supported surface contract.

Sidebar and Builtin expose the same supported workspace root selector: `[data-dsh-plugin="dsh-mnemon"][data-dsh-part="mnemon-view"]`. Theme authors can set these supported custom properties directly on that element; assignments on an ancestor are shadowed by the workspace defaults. Generated CSS-module class names are not public selectors.

| Property | Accepted value and purpose | Default |
|---|---|---|
| `--mn-bg` | CSS color for the base surface | `var(--dsw-alias-bg-base)` |
| `--mn-backdrop` | CSS color behind the base in the default layered surface | `var(--dsw-alias-bg-overlay, var(--mn-bg))` |
| `--mn-surface` | CSS `background` value consumed by the workspace, header and canvas | Base gradient over backdrop gradient, backed by the base color |

The default surface remains `linear-gradient(var(--mn-bg), var(--mn-bg)), linear-gradient(var(--mn-backdrop), var(--mn-backdrop)) var(--mn-bg)`. Its layered backing preserves readability when a skin makes the host base transparent; the official theme stays opaque. A skin can explicitly replace that composition, for example:

```css
[data-dsh-plugin="dsh-mnemon"][data-dsh-part="mnemon-view"] {
  --mn-bg: rgb(232 241 249 / 74%);
  --mn-backdrop: var(--mn-bg);
  --mn-surface: var(--mn-bg);
}
```

Use the paired selector in an unlayered stylesheet as shown. Its specificity `(0,2,0)` exceeds the default custom-property declarations `(0,1,0)`, so the override works whether the skin stylesheet loads before or after Mnemon. A lone `[data-dsh-part="mnemon-view"]` ties the defaults and depends on stylesheet order; a normal declaration inside `@layer` ranks below the unlayered defaults. Add your skin's own ancestor selector when it needs an activation scope.

These properties inherit into workspace descendants that consume them. Body-portaled dialogs and other plugins' roots are outside this selector's scope. Replacing `--mn-surface` chooses the skin's own readability and transparency; it does not change settings, memory data, or Provider behavior.

## Common rules

- Primary actions use the DSH primary button (black in the light theme, white in the dark theme); secondary actions such as Edit use outline buttons; red text is reserved for Delete, Disconnect, Archive, or Forget; neutral actions are View, Copy, and Cancel.
- A Memory Space toggle controls only whether dsh-mnemon includes it in read routing. It is not the Mnemon CLI default Store.
- Mnemon Native physical deletion requires confirmation. External spaces use Disconnect and leave Provider data untouched.
- Pages load by region; a local error never blocks unrelated data or creates a wall of spinners.
- The workbench defaults to Sidebar; Builtin puts the same UI in the owning conversation. Turn memory and Save to memory remain conversation shortcuts.

Next: [Capability map](./capabilities.md) · [Getting Started](./getting-started.md) · [Provider guide](./memory-providers.md) · [Configuration](../reference/configuration.md)

## Idle review controls

**Background tasks** on the Layered strategy's page includes **Idle review**. Its switch, the review method (bounded spawn or full-context fork; a fork also chooses what to do when its context is unavailable) and Agent Teams compatibility apply at once; the interval (in seconds), attempt cap, checkpoint size and output budget under **Review limits** apply with their **Apply**. Review runs only after turns that Layered strategy composed. Changes respect the existing Host settings grant; read-only clients cannot save them. Agent Teams compatibility defaults to **Pause review**, which skips review while Agent Teams runs. With DSH and official Teams 0.1.7-rc.2, **Scoped child review** keeps both features enabled with the same mandatory tool restrictions. The Memory System shows the configured Team pause or partial-write receipts after failure. Refresh status to read current state. See [configuration](../reference/configuration.md#provider-requirements) for retention and restart limits.
