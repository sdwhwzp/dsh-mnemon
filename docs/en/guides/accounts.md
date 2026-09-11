# Deploy Mnemon per signed-in account

This fork's `accountDataDir` gives each authenticated dsh-passwords account private Runtime USER/MEMORY, Documents, Native databases, indexes, revisions, backups and preferences. Sessions of one account share its memory; accounts sharing a workspace do not. Administrators also receive their own memory through these APIs.

Directories use `SHA-256("dsh-passwords:" + accountId)`, so renaming an account does not move its data. Identity comes from the Host-verified RPC principal or the recorded turn/start principal. Browser user ids, names and paths cannot select another account. Session and workspace requests additionally use principalAccess. Stale, deleted or banned accounts are rejected. Subagents and background tasks retain the initiating account and its model permission and accounting checks.

## Server configuration

Use the principal-enabled Harness `0.1.5-rc.2` fork with `dsh-passwords 2.7.0-dsh.20260911.1`. Install all seventeen matching Mnemon packages and apply `deploy/server30-account.patch.yml`, replacing its absolute paths for other deployments. Install Native CLI `0.2.5` separately. Keep account storage outside user workspaces.

Account mode accepts only the bundled Runtime, Documents, Memory Spaces and Native provider. Other Sources, duplicate Source instances and other providers are rejected. Source configuration cannot override account directories. Administrators manage plugin installation, upgrades, storage, embedding credentials and provider connections. Accounts may edit their memory, retrieval limits, layer switches, task models and display preferences.

Without `accountDataDir`, upstream single-user behavior remains available. Existing global memory is never imported automatically or assigned to the first user; its owner may explicitly import a backup. Memory API isolation relies on the deployment's filesystem and command sandbox policies for direct disk access. Do not expose the account root as a user workspace.

## Use and verification

Project documents in historical sessions resolve their workspace from the saved session header without activating an Agent or sending a message. The Host authorizes the account before reading session metadata; the browser supplies no filesystem path. Failed loads display unavailable status and unknown counts. A successful refresh restores counts and enables document creation.

Open the Mnemon workbench after login to maintain personal preferences, runtime memory, documents and long-term evidence. Settings explain private account storage. New sessions use the same account memory. Model writes require a successful Mnemon tool receipt; upstream strategy and authorization behavior remains in place.

Regression coverage includes shared workspaces, concurrent requests, forged principals, foreign sessions, real Harness loops and subagents, background identity, settings generations, inventories and real Native databases. Before deployment, test Web RPC with two accounts in an isolated profile. Server 30 must also retain the artifacts and disabled fast tier recorded in `deploy/server30-pins.json`.

Idle review runs only after the current policy activity threshold is reached. It selects durable user-authored facts and reusable project conclusions; routine setup can return skipped. Harness preserves conversation history separately: memory entries and project documents are not verbatim chat backups. Account adaptation preserves the association between terminal tool signals and result receipts so a completed review ends its model loop.
