import { runAgent, toolEvents, closeAgent } from './agent.js';

const questions = [
  'chicken recipes',
  'asian food in royapettah',
  'plan my saturday',
];

async function main() {
  for (const question of questions) {
    const events = [];
    const collectEvent = (event) => events.push({ ...event });
    toolEvents.on('tool', collectEvent);
    let answer;

    try {
      answer = await runAgent(question);
    } catch (error) {
      answer = error.message || 'Chat test failed.';
      process.exitCode = 1;
    } finally {
      toolEvents.off('tool', collectEvent);
    }
    console.log(`\n> ${question}\n${answer}`);
    console.log('Tool events:', JSON.stringify(events, null, 2));
  }
}

main()
  .catch((error) => {
    console.error(error.message || 'Chat test failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAgent();
  });
