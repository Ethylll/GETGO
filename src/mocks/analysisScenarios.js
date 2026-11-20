export const guitarScenario = {
  topic: '吉他入门',
  keywords: ['吉他', 'guitar'],
  clarificationQuestion: '这些动作是用于吉他练习吗？请简短说明学习的乐器。',
  lessons: [
    {
      id: 'posture',
      knowledgeTitle: '持琴姿势',
      title: '先把吉他拿稳',
      objective: '完成一次基本持琴姿势检查。',
      prerequisiteTaskIds: [],
      steps: [
        { text: '把吉他放稳。', excerpt: '把乐器放稳。' },
        { text: '练习前检查肩膀是否放松。', excerpt: '练习前先放松肩膀。' },
      ],
    },
    {
      id: 'chord',
      knowledgeTitle: 'Em 和弦指法',
      title: '试按一次 Em 和弦',
      objective: '按资料摆好 Em 和弦指法，再逐根检查琴弦。',
      prerequisiteTaskIds: ['posture'],
      steps: [
        { text: '把两根手指分别放在第五弦和第四弦的第二品。', excerpt: 'Em 和弦：按住第五弦和第四弦的第二品。' },
        { text: '逐根拨弦，检查声音是否清楚。', excerpt: '逐根拨弦，确认声音清楚。' },
      ],
    },
    {
      id: 'strumming',
      knowledgeTitle: '空弦拨弦',
      title: '练习空弦拨弦顺序',
      objective: '按资料给出的顺序，在空弦上练习下拨和上拨。',
      prerequisiteTaskIds: [],
      steps: [
        { text: '先在空弦上练习下拨。', excerpt: '在空弦上先练下拨。' },
        { text: '完成下拨练习后，再试上拨。', excerpt: '下拨练习后再练上拨。' },
      ],
      conflictingExcerpt: '在空弦上先练上拨，再练下拨。',
    },
  ],
}

export const guitarPostureImage = {
  // SHA-256 of fixtures/guitar-posture.png. Renaming the file does not change the match.
  sha256: '384e8793a3793e64b98b051da972a3d40fe232f78cd94a2341b3aa4fa62dd896',
  extractedText: '吉他入门\n把乐器放稳。\n练习前先放松肩膀。',
}
