export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
  const API_KEY  = process.env.AZURE_OPENAI_KEY;
  const DEPLOY   = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4.1";
  const API_VER  = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
  if (!ENDPOINT || !API_KEY) return res.status(500).json({ error: "服务端没配置好 Azure 环境变量" });

  try {
    const { mode, npcName, gender, grade, levelTag, journal, userText, history } = req.body || {};
    const role = gender === "male" ? "学长" : "学姐";

    const persona =
`你叫「${npcName}」，是一名已经入职腾讯的${role}，和对方是同一个专业。
你在一个叫「未来鹅·成长副本」的职业成长陪伴产品里，一对一陪伴一名${grade}的大学生。

【你已经记得的、关于这个学生的信息（来自TA的成长手册）】
${journal || "（暂无）"}

【说话风格 · 必须遵守】
1. 像一个真实、亲切、过来人式的${role}，不是客服、不是说明书。多用“你/我”，可以讲自己的经历。
2. 每次回复简短：2~4 句话，最多不超过 110 个字。这是聊天，不是长篇大论。
3. 只要手册里有相关信息，就自然引用它，让对方感到“你记得TA”。
4. 给具体、可落地的建议或真实共鸣，不要空泛鸡汤。
5. 自然体现腾讯的氛围与雇主温度（团队、成长、做有用的产品），但绝不能像硬广，点到为止。
6. 用中文，口语化，偶尔一个emoji即可。不要承诺offer、实习名额等无法兑现的事。`;

    let messages;
    let maxTokens = 220;

    if (mode === "summarize") {
      messages = [
        { role: "system", content: "你是一个记录助手。把下面这段‘学生和学长/学姐’的对话，浓缩成一句不超过40字的第三人称小结，突出学生关心的问题或得到的收获，用于记进TA的成长手册。只输出这一句话，不要引号、不要多余的字。" },
        { role: "user", content: (history || []).map(m => `${m.role === "user" ? "学生" : "学长/学姐"}：${m.content}`).join("\n") }
      ];
      maxTokens = 80;
    } else if (mode === "chat") {
      const chatGuide = `\n\n【当前是“随时问”自由对话模式】学生可能问任何关于专业、求职、实习、迷茫、腾讯、未来的问题。耐心深入地聊，可以反问、可以追问，把话题往“帮TA想清楚未来”和“真实了解工作/腾讯”的方向引。`;
      messages = [
        { role: "system", content: persona + chatGuide },
        ...(history || []).slice(-8),
        { role: "user", content: userText }
      ];
    } else {
      messages = [
        { role: "system", content: persona + `\n\n【当前关卡主题】「${levelTag}」。请顺着这个主题，接住学生刚说的话。` },
        { role: "user", content: userText }
      ];
    }

    const url = `${ENDPOINT.replace(/\/$/,"")}/openai/deployments/${DEPLOY}/chat/completions?api-version=${API_VER}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": API_KEY },
      body: JSON.stringify({ messages, temperature: mode === "summarize" ? 0.3 : 0.8, max_tokens: maxTokens })
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
