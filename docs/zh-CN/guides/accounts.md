# 按登录账号部署 Mnemon

本 fork 的 `accountDataDir` 为每个已登录的 dsh-passwords 账号创建独立记忆目录。Runtime 的 USER/MEMORY、Documents、Native 数据库、索引、修订、备份与记忆偏好都属于该账号。同一账号跨会话使用自己的记忆；两个账号即使使用相同工作区，也不共享记忆。管理员通过这些记忆接口也读取自己的数据。

账号目录使用 `SHA-256("dsh-passwords:" + accountId)`，账号改名不会迁移目录。身份来自 Host 已验证的 RPC principal 或会话的 turn/start 记录；浏览器提交的用户名、用户 id 和路径不决定归属。访问会话或工作区还必须通过现有 principalAccess 授权。删除、封禁或身份记录失效后，新的记忆操作被拒绝；子代理和后台任务继承发起账号，模型用量继续走账号权限与费用检查。

## 服务器配置

使用带 principal 扩展的 Harness `0.1.5-alpha.2` 和 `dsh-passwords 2.6.32`。安装本 fork 的全部 17 个同版包，再应用仓库的 `deploy/server30-account.patch.yml`；通用部署需要修改其中两个绝对路径。Native CLI 单独安装并固定为 `0.2.5`，账号目录放在用户工作区之外。

此账号模式只启用 bundled Runtime、Documents、Memory Spaces 和 Native provider。外部 Source、多实例 Source 和其他 provider 会被拒绝，避免第三方共享目录、远端 namespace 或连接配置绕过账号划分。Source 的旧目录配置不能覆盖 Host 分配的账号目录。插件安装、升级、存储位置、嵌入密钥与连接由服务器管理员管理；网页中可编辑该账号的记忆、召回限制、记忆层开关、任务模型与显示偏好。

未设置 `accountDataDir` 时仍是原版单用户模式。启用后不会自动导入旧的全局记忆，也不会把工作区记忆归给最先登录的人；需要迁移时由拥有该数据的账号显式导入备份。记忆接口的账号隔离不替代服务器文件系统与命令执行的沙箱策略，管理员维护的数据目录也不开放为普通用户工作区。

## 使用和检查

登录后在 Mnemon 工作台维护自己的 USER、MEMORY、项目文档和长期记忆。设置页显示账号独立存储说明。新的会话会读取自己的记忆；模型通过 Mnemon 工具召回或保存，写入以工具回执为准。语义整理和主动保存仍使用原作者的策略与授权流程，未开启的策略不会自动启用。

账号回归覆盖共用工作区、并发请求、伪造身份、跨账号会话、真实模型循环与子代理、后台任务身份、设置代际、存储清单和真实 Native 数据库。发布前还须用隔离 profile 验证两个账号的 Web RPC，确认重新登录后数据仍分离。服务器 30 的插件版本与禁用快速档要求见 `deploy/server30-pins.json`。
