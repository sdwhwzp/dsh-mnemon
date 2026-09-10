# dsh-mnemon fork

Read [FORK.md](FORK.md) for the source repository, owned push URL, current integration branch and release checks. Follow the parent `macproject/AGENTS.md` synchronization rules. Account isolation must cover RPC, model tools, logged memory messages, subagents, background tasks, settings, inventories and backups. Account storage uses Host-authenticated immutable account ids, never browser user ids, usernames or workspace paths. Preserve the upstream behavior when `accountDataDir` is absent. Ship the seventeen Mnemon artifacts together; do not install shared providers or change storage roots from account settings.

Server 30 releases must preserve [the pinned plugins](deploy/server30-pins.json), the `llm-subscriptions` setting `fastTier: false`, and the current WeKnora package. Re-read the live profile before preparing a candidate and reject cutover when its recorded files or current links have changed.
