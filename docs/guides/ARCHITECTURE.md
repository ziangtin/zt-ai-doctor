# zt-ai-doctor 架构与流程

> 本文档用流程图说明 zt-ai-doctor 的设计流程、数据流与实现链路。所有图使用 Mermaid，GitHub 原生渲染。
>
> - 图 1–2：**设计视角**（用户流程、数据流）
> - 图 3–5：**实现视角**（对应源码，反映当前真实行为）
> - 图 6：**规划中**的未来架构（来自 [PRODUCT_OPTIMIZATION_PLAN.md](../design/PRODUCT_OPTIMIZATION_PLAN.md)，尚未实现）

## 图例

| 形状 | 语法 | 含义 |
|---|---|---|
| 矩形 | `[text]` | 处理 / 步骤 |
| 胶囊 | `([text])` | 起止 / 状态 |
| 菱形 | `{text}` | 判断 |
| 圆柱 | `[(text)]` | 数据存储 |
| 平行四边形 | `[/text/]` | 输入 / 输出 |
| 虚线 | `-.->` | 记录 / 校验等弱依赖 |

---

## 1. 看诊流程（设计 · 用户视角）

整个工具按医生看诊走：**建档 -> 诊断 -> 开方 -> 下药 -> 复诊**，对症下药。`prescribe` 内部先跑诊断，`treat` 不带 id 时读处方单勾选抓药，复诊未消除症状则回到开方。

```mermaid
flowchart TD
    A([init 建档<br/>建 .agents/ + lockfile]) --> B([diagnose 诊断<br/>出症状报告])
    B --> C([prescribe 开方<br/>扫技术栈 + 匹配])
    C --> C1[/"编辑 prescription.md<br/>勾选 [x]"/]
    C1 --> D([treat 下药<br/>装资产 + sync])
    D --> E([diagnose 复诊])
    E --> F{症状消除?}
    F -- 否 --> C
    F -- 是 --> G([✅ 闭环])
    D -. "不带 id -> 读处方单抓药" .-> D
```

---

## 2. 数据流（设计 · 数据视角）

药典（`market`）经 `treat` 拷贝成项目内 canonical 源（`.agents/<type>/`），再经 `sync` 渲染成构建产物（`.build/<agent>/`），最后以 symlink/copy 落到各 agent 原生配置。company overlay 按 id 覆盖 canonical，lockfile 记录并校验已装资产。

```mermaid
flowchart LR
    M[("market 药典<br/>cli/market")]
    CO[".agents/company/<br/>overlay (gitignored)"]
    A[".agents/&lt;type&gt;/<br/>canonical 源"]
    B[".build/&lt;agent&gt;/<br/>构建产物 (gitignored)"]
    T["agent 配置<br/>CLAUDE.md / .cursor / .mcp.json ..."]
    L[("zai.lock.json<br/>已装资产 + hash")]

    M -- "treat 拷贝" --> A
    CO -. "同 id 覆盖" .-> A
    A -- "sync 渲染" --> B
    B -- "symlink / copy" --> T
    L -. "记录/校验" .-> A
```

---

## 3. sync 引擎实现流程（实现 · 核心）

对应 [sync.ts](../cli/src/commands/sync.ts) 的 `runSync`：读资产 -> 分层合并 -> 选 renderer -> 兼容/信任过滤 -> 渲染 -> 放置 -> GC -> 写 manifest 与报告。

```mermaid
flowchart TD
    S0["loadProjectAssets<br/>读 .agents/ 各层资产"] --> S1["resolveAssets<br/>分层合并 company&gt;personal&gt;baseline<br/>同层 priority 取大"]
    S1 --> S2["选 renderer<br/>detect 各 agent 或 --agent 指定<br/>未知 agent -> exit 2"]
    S2 --> S3["applicableAssets 过滤<br/>supports + meta.agents + MCP 信任<br/>不兼容 -> skip"]
    S3 --> S4["renderAll<br/>生成构建产物 + Placement"]
    S4 --> S5["place<br/>软链优先 / 降级 copy<br/>受管冲突保护"]
    S5 --> S6["GC<br/>上一轮受管、本轮未再生成的目标<br/>未被用户改过才清理"]
    S6 --> S7["writeManifest 原子写<br/>+ sync-report.md"]
```

---

## 4. place 放置决策（实现 · 细节）

对应 [place.ts](../cli/src/core/place.ts) 的 `place()`。这是 Windows copy 降级后仍可重同步、以及保护用户修改的关键决策树：受管 symlink 直接替换；内容一致 no-op；受管 copy 源更新可覆盖；用户改过或未知文件则冲突 skip，绝不自动覆盖。

```mermaid
flowchart TD
    P0(["place(p, prev)"]) --> P1{"action = skip?"}
    P1 -- 是 --> PS([skip])
    P1 -- 否 --> P2{"目标存在?"}
    P2 -- 否 --> PLACE
    P2 -- 是 --> P3{"是 symlink?"}
    P3 -- 是 --> RM["rm（我们的）"]
    P3 -- 否 --> P4{"hash == 源 hash?"}
    P4 -- 是 --> NOP(["no-op 已是最新"])
    P4 -- 否 --> P5{"prev 且 hash == prev.hash?"}
    P5 -- 是 --> RM2["rm 受管 copy"]
    P5 -- 否 --> CONF(["冲突 skip 不覆盖"])
    RM --> PLACE["放置: symlink 失败降级 copy"]
    RM2 --> PLACE
    PLACE --> DONE(["记录 PlacementRecord"])
    NOP --> DONE
```

---

## 5. 分层合并决策（实现 · 细节）

对应 [layers.ts](../cli/src/core/layers.ts) 的 `resolveAssets`。同 id 资产按层 `company(30) > personal(20) > baseline(10)` 取高；同层按 `priority`（默认 0）取大；多于一个则记录 override，落进 sync 报告。

```mermaid
flowchart TD
    L0["载入所有层资产<br/>baseline + personal + company"] --> L1["按 id 分组"]
    L1 --> L2{"同 id 数量"}
    L2 -- "1" --> L3["直接进 resolved"]
    L2 -- "多个" --> L4["逐对比较"]
    L4 --> L5{"层级 rank"}
    L5 -- "company=30 &gt; personal=20 &gt; baseline=10" --> L6["取层级高者"]
    L5 -- "同层级" --> L7{"priority 取大<br/>默认 0"}
    L6 --> L8["winner 进 resolved"]
    L7 --> L8
    L8 --> L9["记录 override<br/>id + 参与层 + winner"]
```

---

## 6. 未来 sync 四阶段（规划中）

> ⚠️ 尚未实现，来自 [PRODUCT_OPTIMIZATION_PLAN.md](../design/PRODUCT_OPTIMIZATION_PLAN.md) §5.3 / §2.2。

规划中的 sync 收敛为 `discover -> plan -> preview -> apply` 四阶段，并引入转换 fidelity 三级：`exact` 正常生成、`degraded` 有损需确认、`unsupported` 拒绝生成不静默降级；写操作走 journal + 备份，可 rollback。

```mermaid
flowchart TD
    F0["discover<br/>读当前配置 + 上次 operation state"] --> F1["plan<br/>解析资产/作用域/依赖/renderer capability"]
    F1 --> F2["preview<br/>文件级 + 字段级 diff<br/>转换损失 + 安全提示"]
    F2 --> F3{"fidelity"}
    F3 -- "exact" --> F4["正常生成"]
    F3 -- "degraded" --> F5["输出差异/原因<br/>默认要求确认<br/>--allow-degraded 放行"]
    F3 -- "unsupported" --> F6["拒绝生成<br/>不做静默降级"]
    F4 --> F7["apply<br/>journal + 备份后原子写<br/>失败自动恢复"]
    F5 --> F7
    F7 --> F8["可 rollback"]
```

---

设计见 [../design/IMPLEMENTATION_PLAN.md](../design/IMPLEMENTATION_PLAN.md)，使用说明见 [USAGE.md](./USAGE.md)，当前方案评审见 [../design/CURRENT_SOLUTION_REVIEW.md](../design/CURRENT_SOLUTION_REVIEW.md)。
