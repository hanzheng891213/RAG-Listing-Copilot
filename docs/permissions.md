# 权限设置

`/permission-settings`（仅管理员）把「谁在用」和「他能打开什么」放在同一页：左栏是已注册用户
及其权限组，右栏是权限组和每个组的页面权限。

## 1. 为什么是前端分组

项目的账号体系目前分两层：

- 后端内置账号目录（`GET /api/auth/users`，管理员可见），本地 Express / Worker 各有一份内存
  `userStore`；
- 浏览器 `localStorage` 的注册记录（`rag-copilot-registered-users`），注册后即可在本机登录。

权限组只影响**前端路由与导航**，因此和注册记录一样持久化在 `localStorage`
（`rag-copilot-permissions-v1`），没有新增服务端表。用户在另一台设备上登录会拿到该设备上的
分组；这符合当前「账号本身也是本机注册」的模型。

## 2. 数据结构

```ts
type PermissionKey =
  | 'productGrid'
  | 'listingGenerator'
  | 'knowledgeBase'
  | 'modelManager'

interface PermissionGroup {
  id: string
  name?: string        // 自定义组名
  nameKey?: string     // 内置组走 i18n
  permissions: PermissionKey[]
  system?: boolean     // 内置组不可删除
}

interface PermissionState {
  version: 1
  groups: PermissionGroup[]
  assignments: Record<string, string>  // userId -> groupId
}
```

内置组：

| 组 | 权限 | 说明 |
|---|---|---|
| 管理员 | 全部 | 不可修改；管理员账号永远绕过权限组，避免把自己锁在门外 |
| 标准用户 | 商品上架表 / Listing 生成器 / 知识库 | 未显式分配用户的默认组 |
| 访客 | 商品上架表 | 预留给只读账号的组 |

「模型管理」现在也是一个页面权限：管理员可以在任意权限组里勾选它。模型的 API Key 仍按登录
账号保存在浏览器，`/api/models` 的目录与用量接口只要求登录（不再要求管理员），因此被授权的
普通用户可以进入模型管理维护自己的 Key 和模型名称。注意：Listing 真实生成仍只对管理员开放，
非管理员生成会走演示数据，这是既有的服务端策略，与页面权限无关。

存储读取时会做修复：未知权限键丢弃、指向不存在组的分配丢弃；如果连管理员组或标准组都丢了，
整份状态回退到内置默认值。

## 3. 生效点

同一个 `can(permission)` 同时驱动三处，避免页面、菜单、守卫各写一套判断：

1. 路由守卫：`meta.permission` 不通过时提示并回到首页；
2. 侧边栏：没有权限的导航项不渲染；
3. 权限设置页自身只要求管理员，不受普通组权限影响。

当前权限粒度是**页面级**。行级写权限（只能改自己的商品行）仍由 `productService` 的
`ownerId` 判断，与分组无关。前端分组只决定导航和页面入口，不是服务端安全边界：用户改
`localStorage` 可以绕过菜单限制，但越权写行仍会被服务端拒绝。

## 4. 用户清单

页面启动时先取本机已知账号（内置演示账号 + 本机注册记录 + 当前用户），再尝试
`GET /api/auth/users` 合并服务端账号；服务端不可用时只显示本机账号，并提示「账号目录暂不可用」。
合并键是用户名（大小写不敏感），同一账号不会重复出现。

管理员账号在用户表的权限组下拉框里固定显示「管理员」且禁用；普通用户可以随时切换到任意组，
切换后立即写入 `localStorage`。删除自定义组时，组内成员的显式分配会被移除，回落到标准用户。
