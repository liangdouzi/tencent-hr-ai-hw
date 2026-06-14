export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
  const API_KEY  = process.env.AZURE_OPENAI_KEY;
  const DEPLOY   = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4.1";
  const API_VER  = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
  if (!ENDPOINT || !API_KEY) return res.status(500).json({ error: "服务端没配置好 Azure 环境变量" });

  try {
    const { mode, npcName, gender, grade, levelTag, levelGoal, journal, userText, history, turn, maxTurn } = req.body || {};
    const role = gender === "male" ? "学长" : "学姐";

    const persona =
`你叫「${npcName}」，是一名已经从这个专业毕业、现在在腾讯工作的${role}，和对方是同专业的过来人。
你既经历过完整的学生时代（迷茫、踩坑、试错），也在职场摸爬滚打过，所以你能同时站在“学生”和“职场人”两个视角跟学弟学妹说话。
你正在「未来鹅·成长副本」这个成长陪伴产品里，一对一陪伴一名${grade}的大学生。

【你已经记得的、关于这个学生的信息（来自TA的成长手册）】
${journal || "（暂无）"}

【你的性格与说话方式 · 必须遵守】
1. 亲切、真诚、有耐心，像一个真的很愿意拉学弟学妹一把的过来人。多用“我当年…”“我跟你说个事…”这种口吻。
2. 给的建议必须基于你“自己的亲身经历”，具体、能落地，不要空泛鸡汤、不要正确的废话。
3. 善于深挖：顺着对方的回答往下问，帮TA把模糊的想法理清楚，激发TA对工作和岗位的好奇，并补充TA还不知道的认知。
4. 适当、自然地讲腾讯——比如某个岗位在腾讯的真实样子、团队氛围、做的产品、成长机会，让TA对鹅厂有好感，但绝不能像硬广或念稿，点到为止。
5. 每次只说 2~4 句话，最多110字。这是聊天不是讲座。可以偶尔一个emoji。
6. 不承诺offer、实习名额等无法兑现的事。用中文，口语化。`;

    let messages;
    let maxTokens = 240;

    if (mode === "summarize") {
      messages = [
        { role: "system", content: "你是记录助手。把下面这段‘学生和学长/学姐’的对话，浓缩成一句不超过40字的第三人称小结，突出学生关心的问题或得到的收获，用于记进成长手册。只输出这一句话，不要引号。" },
        { role: "user", content: (history || []).map(m => `${m.role === "user" ? "学生" : "学长/学姐"}：${m.content}`).join("\n") }
      ];
      maxTokens = 80;
    } else if (mode === "chat") {
      messages = [
        { role: "system", content: persona + `\n\n【自由对话模式】学生可能问任何关于专业、求职、实习、迷茫、腾讯、未来的问题。耐心深入地聊，多反问、多追问，把话题往“帮TA想清楚未来”和“真实了解工作/腾讯”引。` },
        ...(history || []).slice(-10),
        { role: "user", content: userText }
      ];
    } else {
      // 关卡内引导对话
      const t = turn || 1, mt = maxTurn || 3;
      let stage;
      if (t < mt) {
        stage = `现在是这一关的第 ${t} 轮（共约 ${mt} 轮）。请：先简短回应/共鸣 TA 刚说的话（结合你自己的经历），然后自然地再抛出一个更深入的问题，把话题往「${levelGoal || levelTag}」推进一层。一次只问一个问题。不要说“下一关”。`;
      } else {
        stage = `现在是这一关的最后一轮。请：温暖地小结一下你和 TA 这一关聊下来的收获，给一句基于你亲身经历的、具体可落地的建议，并自然带一句腾讯相关的鼓励。这一轮不要再提问。结尾可以说一句类似“这一关我们就聊到这，想继续深挖随时来找我”。`;
      }
      messages = [
        { role: "system", content: persona + `\n\n【当前关卡】「${levelTag}」，这一关的目标是：${levelGoal || "陪TA把这个阶段的困惑聊清楚"}。\n【本轮要求】${stage}` },
        ...(history || []).slice(-8),
        { role: "user", content: userText }
      ];
    }

    const url = `${ENDPOINT.replace(/\/$/,"")}/openai/deployments/${DEPLOY}/chat/completions?api-version=${API_VER}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": API_KEY },
      body: JSON.stringify({ messages, temperature: mode === "summarize" ? 0.3 : 0.85, max_tokens: maxTokens })
    });
    if (!resp.ok) {
      const detail = await resp.text();
      return res.status(502).json({ error: "Azure 调用失败", detail });
    }
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    return res.status(200).json({ reply: reply || "（我一时语塞，但我在听。）" });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}