import { PhraseResult, WordResult } from './interfaces';
import { makeVoiceCtrl } from './voiceCtrl';

const ROUND_LENGTH = [20, 20, 10] as const;

const results: PhraseData[][] = [[], [], []];

type PhraseData = {
  heard: PhraseResult;
  exact: string;
};

makeNotHoward();

addEventListener('load', () => window.scrollTo(1, 0), false);

function makeNotHoward() {
  const userScore = [0, 0, 0];
  let currentPhrase = '';
  let stateIndex = 0;
  let phraseIndex = 0;
  let voiceCtrl = makeVoiceCtrl();

  $('#howard').addEventListener('click', clickNotHoward);

  voiceCtrl.addListener('message', async (msg: string, full: WordResult) => {
    if (stateIndex === 0) $('#text').innerText = msg;
    else if (stateIndex === 4) {
      if (msg === 'next') clickNotHoward();
    } else if (stateIndex === 5) {
      $('#text').innerText = msg;
      howardSays(true);
    } else if (phraseIndex >= 0 && msg === 'next') {
      clickNotHoward();
    } else if (phraseIndex > 0 && phraseIndex <= ROUND_LENGTH[stateIndex - 1]) {
      $('#howard').className = '';
      const rankAbbrev = msg
        .split(' ')
        .map(x => rankMap(x))
        .join(' ');
      if (rankAbbrev === currentPhrase) userScore[stateIndex - 1]++;

      storePhraseResult(stateIndex - 1, phraseIndex - 1, {
        heard: { text: rankAbbrev, result: full },
        exact: currentPhrase,
      });
      console.log(results[stateIndex - 1][phraseIndex - 1]);
      howardSays(true);
    }
  });

  async function clickNotHoward() {
    if ($('#howard').className === 'disabled') return;
    if (stateIndex === 0) {
      await voiceCtrl.start();
      await bumpState();
    } else if (stateIndex > 3) {
      if (stateIndex === 4) window.location.reload();
    } else {
      $('#howard').className = 'disabled';
      const span = $(`#state${stateIndex} span#progress`) as HTMLSpanElement;
      if (phraseIndex >= ROUND_LENGTH[stateIndex - 1]) {
        await getNext();
        await bumpState();
      } else {
        howardSays();
        $('#text').style.visibility = 'hidden';
        currentPhrase = await getNext();
        span.innerText = `(${++phraseIndex} of ${ROUND_LENGTH[stateIndex - 1]})`;
        $('#text').innerText = capitalize(currentPhrase);
        $('#text').style.visibility = 'visible';
      }
    }
  }

  async function bumpState() {
    phraseIndex = 0;
    $('#text').innerText = '';
    $('#howard-bubble').style.visibility = 'hidden';
    $(`#state${stateIndex++}`).style.display = 'none';
    $(`#state${stateIndex}`).style.display = 'block';
    $('#howard').className = stateIndex > 4 ? 'disabled' : '';
    if (stateIndex === 4) showResults();
  }
  async function showResults() {
    getNext(); // flush last result
    // voiceCtrl.stop();
    howardSays('Can we please go again?');
    $('#results').innerHTML =
      `<h3>Round 1: ${(userScore[0] / ROUND_LENGTH[0]) * 100}%</h3>` +
      `<h3>Round 2: ${(userScore[1] / ROUND_LENGTH[1]) * 100}%</h3>` +
      `<h3>Round 3: ${(userScore[2] / ROUND_LENGTH[2]) * 100}%</h3>`;
  }

  function storePhraseResult(r: number, p: number, phraseData: PhraseData): PhraseResult {
    while (results[r].length < p) results[r].push({ heard: { result: [], text: '' }, exact: '' });
    if (results[r].length == p) results[r].push(phraseData);
    else if (phraseData.heard.text === currentPhrase) results[r][p] = phraseData;
    else {
      const current = currentPhrase.split(' ');
      const oldScore = results[r][p].heard.text.split(' ').filter(x => current.includes(x)).length;
      const newScore = phraseData.heard.text.split(' ').filter(x => current.includes(x)).length;
      if (newScore > oldScore) results[r][p] = phraseData;
      else if (newScore === oldScore && confidenceSum(phraseData.heard) > confidenceSum(results[r][p].heard))
        results[r][p] = phraseData;
    }
    return results[r][p].heard;
  }

  function howardSays(text?: string | true) {
    $('#howard-bubble').style.visibility = text === undefined ? 'hidden' : 'visible';
    if (text === true)
      text =
        phraseIndex == 1 && stateIndex == 1
          ? "Click me or say 'next' to continue!"
          : howardLines[Math.round(Math.random() * howardLines.length)];

    if (text) $('#howard-text').innerText = text;
  }

  async function getNext(): Promise<any> {
    const body =
      stateIndex === 0 || phraseIndex === 0
        ? null
        : JSON.stringify({
            round: stateIndex,
            exact: results[stateIndex - 1][phraseIndex - 1].exact,
            heard: results[stateIndex - 1][phraseIndex - 1].heard.text,
            data: results[stateIndex - 1][phraseIndex - 1].heard.result,
          });
    console.log(body);
    const rsp = await fetch('crowdv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body,
    });
    if (rsp.status !== 200) throw new Error('Server error');
    const obj = await rsp.json();
    return obj.next;
  }
}

function $(sel: string): HTMLElement {
  return document.querySelector(sel) as HTMLElement;
}

function confidenceSum(phrase: PhraseResult) {
  return phrase.result.reduce((sum, word) => sum + word.conf, 0);
}

function capitalize(str: string) {
  return str
    .split(' ')
    .map((s, i) => (i == 0 || s.length == 1 ? s[0].toUpperCase() : s[0]) + s.slice(1))
    .join(' ');
}
function rankMap(word: string) {
  if (word === 'one') word = '1';
  else if (word === 'two') word = '2';
  else if (word === 'three') word = '3';
  else if (word === 'four') word = '4';
  else if (word === 'five') word = '5';
  else if (word === 'six') word = '6';
  else if (word === 'seven') word = '7';
  else if (word === 'eight') word = '8';
  return word;
}

const howardLines = [
  'I heard that.',
  'You talk funny. I like it.',
  'Good job!',
  'I want us to be friends.',
  "You're the coolest!",
  'I like you!',
  "Let's do some more!",
  'This is good.',
  'I could do this all day!',
  "There's nothing better than this.",
  "We're having so much fun.",
  'These are the best of times.',
  'Yay!',
  "You're my best friend.",
  "You tell that microphone who's boss!",
  'What a voice!',
  'Amen!',
  'Can we keep going?',
  'How much do you charge for this?',
  'I could listen to you for hours.',
  "I'm having such a good time!",
  'Great party!',
  "Don't stop now!",
  'Could I get a glass of water?',
  'You sound a bit hoarse.',
  'I think I just inked.',
  'You are the best.',
  "I'm so lucky we are friends!",
  'You should be a chesscaster.',
  'Will there be cake after?',
  'Only the void awaits us.',
  'I get to make 8 moves per ply!',
  'I like your style.',
  'You are a kind person.',
  'You are the best.',
  'I love to hear you talk.',
  'Tell me another move!',
  'Can I livestream this?',
  'Will lichess ever read my appeal?',
  'Will lichess add fin support so dolphins can play?',
  'How does lichess detect sharks?',
  'You are so good at this.',
  "You're my favorite",
  'Just wait till I get my tentacles on a chessboard!',
  'When will support for other cuttlefish be added?',
  'So assertive!',
  "I'm almost there!",
  'Your tactics are inspiring!',
  "I'm glad you're here.",
  "I'm having so much fun!",
  "You're not going to eat me, are you?",
  'Wanna see me simul 8 bullet rounds at once?',
  "My sea friends say humans are bad.  But you're not!",
  "I'm going to tell the whole school about this.",
  'Want to go swimming some time?',
];
