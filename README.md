# Hydro 前端修改插件

兼容 V5.0.1 社区版，不依赖任何额外插件和第三方库，安装方法见官方文档。

`/img` 中是 `README.md` 的截图，安装时可以放心删除。

## 首页

调整了比赛展示页，界面参考洛谷首页近期比赛展示页。

## 训练界面

增加了训练分类功能，任意用户均可在训练首页按照训练类别进行筛选，默认展示所有训练题单。

拥有 `PERM_CREATE_TRAINING` 权限的用户可以管理训练分类，主要功能如下：

1. 新增类别：必须设置类别 ID 和展示名，类别 ID 用于跳转路由，建议使用合法标识符，训练首页展示时会按照类别 ID 字典序展示。
2. 训练分类：给特定训练题单设置类别标签。
3. 删除类别：根据类别 ID 进行删除，删除后该类别中的训练题单将失去类别标签。

调整了训练题单的展示页，灵感来自 HOJ 训练展示页，界面参考洛谷题单展示页。

## 数据表

训练分类信息存储在全局表 `trainingcategory` 中，不会向任何原生数据表添加字段，便于迁移。

|字段|类型|说明|
|:-:|:-:|:-|
|`domainId`|`string`|域 ID|
|`category`|`string`|类别 ID|
|`displayName`|`string`|类别展示名|
|`trainingIds`|`ObjectId[]`|训练 ID 列表|

## 部分截图

![image1.png](./public/image1.png)

![image2.png](./public/image2.png)

![image3.png](./public/image3.png)

![image4.png](./public/image4.png)