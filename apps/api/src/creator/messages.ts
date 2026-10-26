export type CreatorMessageKind = "collaboration" | "resource" | "system" | "milestone";

export type CreatorMessage = {
  id: string;
  kind: CreatorMessageKind;
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
  createdAt: string;
  readAt?: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function initialMessages(): CreatorMessage[] {
  const now = Date.now();
  return [
    {
      id: "creator-message-review",
      kind: "collaboration",
      title: "有一份演示等待你复核",
      body: "质量中心已经完成首轮检查。请确认事实、版权与最终表述后再交付。",
      actionHref: "/?view=quality",
      actionLabel: "前往质量中心",
      createdAt: new Date(now - 18 * MINUTE).toISOString(),
    },
    {
      id: "creator-message-resource",
      kind: "resource",
      title: "资源中心已为你准备好三种模板体系",
      body: "标准 PPT、HTML 网页演示和图片式 PPT 现已共用一套授权与版本记录。",
      actionHref: "/resources",
      actionLabel: "查看资源中心",
      createdAt: new Date(now - 2 * HOUR).toISOString(),
    },
    {
      id: "creator-message-blueprint",
      kind: "collaboration",
      title: "演示蓝图有新的协作反馈",
      body: "团队建议把核心结论提前，并为增长目标补充一个可验证的时间节点。",
      actionHref: "/?view=blueprint",
      actionLabel: "查看蓝图",
      createdAt: new Date(now - 5 * HOUR).toISOString(),
    },
    {
      id: "creator-message-credits",
      kind: "system",
      title: "本周期 AI 点数与权益已更新",
      body: "你可以在用量页查看余额、生成消耗和当前可用的导出格式。",
      actionHref: "/account/usage",
      actionLabel: "查看账户用量",
      createdAt: new Date(now - DAY).toISOString(),
      readAt: new Date(now - 22 * HOUR).toISOString(),
    },
    {
      id: "creator-message-milestone",
      kind: "milestone",
      title: "本周创作链路保持稳定",
      body: "项目、蓝图、编辑、检查与交付仍在同一个项目数据源中持续同步。",
      actionHref: "/?view=projects",
      actionLabel: "回到项目列表",
      createdAt: new Date(now - 2 * DAY).toISOString(),
      readAt: new Date(now - DAY).toISOString(),
    },
  ];
}

export class CreatorMessageService {
  private readonly messagesByUser = new Map<string, CreatorMessage[]>();

  list(userId: string): CreatorMessage[] {
    const messages = this.ensure(userId);
    return messages.map((message) => ({ ...message }));
  }

  markRead(userId: string, messageId: string, read: boolean): CreatorMessage | undefined {
    const messages = this.ensure(userId);
    const index = messages.findIndex(({ id }) => id === messageId);
    const current = messages[index];
    if (!current) return undefined;
    const next: CreatorMessage = read
      ? { ...current, readAt: new Date().toISOString() }
      : (({ readAt: _readAt, ...unread }) => unread)(current);
    messages[index] = next;
    return { ...next };
  }

  markAllRead(userId: string): CreatorMessage[] {
    const readAt = new Date().toISOString();
    const messages = this.ensure(userId).map((message) => message.readAt ? message : { ...message, readAt });
    this.messagesByUser.set(userId, messages);
    return messages.map((message) => ({ ...message }));
  }

  private ensure(userId: string): CreatorMessage[] {
    const existing = this.messagesByUser.get(userId);
    if (existing) return existing;
    const seeded = initialMessages();
    this.messagesByUser.set(userId, seeded);
    return seeded;
  }
}
