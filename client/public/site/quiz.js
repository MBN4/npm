'use strict';

function mountPharmaQuiz(quiz) {
const language = document.createElement('select');
const languageLabel = document.createElement('span');
const picker = document.createElement('label');
picker.append(languageLabel, language);
for (const [code, label] of Object.entries({en:'English', ur:'اردو', it:'Italiano', de:'Deutsch', ar:'العربية'})) {
  language.add(new Option(label, code));
}
const answers = [1, 2, 0, [1, 2, 0], 2];
let locale = 'en';
try {
  const saved = localStorage.getItem('abduls-pharma-locale');
  if (Object.hasOwn(copy, saved)) locale = saved;
} catch {}
let index = 0;
let selections = [];
let order = [];

function node(tag, value, className) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
}
function button(label, action, className) {
  const element = node('button', label, className);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}
function correct(position, value) {
  const expected = answers[position];
  return Array.isArray(expected)
    ? expected.length === value.length && expected.every((stage, step) => stage === value[step])
    : value === expected;
}
function rerender() {
  render();
  quiz.querySelector('[data-current]')?.focus();
}
function visualCards(ui) {
  const cards = node('div', undefined, 'quiz-visuals');
  const labels = index === 0 || index === 4;
  const captions = labels ? (index === 0 ? ['Demo A'] : ['Demo A', 'Demo B']) : [];
  const art = {1: 'lab', 2: 'manufacturing', 3: 'body'}[index];
  const cardCount = labels ? captions.length : 1;
  for (let position = 0; position < cardCount; position += 1) {
    const card = node('div');
    if (art) {
      const image = node('img', undefined, 'quiz-art');
      image.src = '/site/assets/story-' + art + '.webp';
      image.alt = '';
      card.append(image);
    }
    if (captions[position]) card.append(node('b', captions[position]));
    if (labels) {
      const ingredient = node('bdi', 'Paracetamol');
      const strength = node('bdi', position === 0 ? '500 mg' : '250 mg');
      ingredient.dir = strength.dir = 'ltr';
      card.append(node('div', ui[16]), ingredient, node('div', ui[15]), strength);
    }
    cards.append(card);
  }
  return cards;
}
function render() {
  quiz.lang = locale;
  quiz.dir = ['ar', 'ur'].includes(locale) ? 'rtl' : 'ltr';
  language.value = locale;
  const {ui, questions} = copy[locale];
  languageLabel.textContent = ui[0];
  quiz.replaceChildren(picker, node('h3', ui[1]));
  const format = new Intl.NumberFormat(locale);

  if (index === answers.length) {
    const total = selections.filter((value, position) => correct(position, value)).length;
    const title = node('h2', ui[8] + ' · ' + format.format(total) + ' / ' + format.format(answers.length));
    title.tabIndex = -1;
    title.dataset.current = '';
    quiz.append(title, button(ui[9], () => {
      index = 0;
      selections = [];
      order = [];
      rerender();
    }, 'primary'));
    return;
  }

  const [prompt, choices, hint, explanation] = questions[index];
  const value = selections[index];
  const answered = value !== undefined;
  const layout = node('div', undefined, 'quiz-layout');
  const question = node('section', undefined, 'card');
  const heading = node('h2', prompt);
  heading.tabIndex = -1;
  heading.dataset.current = '';
  question.append(node('p', ui[2] + ' ' + format.format(index + 1) + ' / ' + format.format(answers.length), 'eyebrow'), heading, visualCards(ui));

  const choiceGroup = node('div', undefined, 'quiz-choices');
  choices.forEach((choice, position) => {
    const option = button('ABC'[position] + ' · ' + choice, () => {
      if (index === 3) order.push(position);
      else selections[index] = position;
      rerender();
    });
    option.disabled = answered || order.includes(position);
    option.setAttribute('aria-pressed', String(index === 3 ? (value ?? order).includes(position) : value === position));
    choiceGroup.append(option);
  });
  question.append(choiceGroup);

  if (index === 3) {
    question.append(node('p', ui[12] + ' · ' + (value ?? order).map(position => choices[position]).join(' → '), 'quiz-order'));
    if (!answered) {
      const controls = node('div', undefined, 'quiz-controls');
      const check = button(ui[10], () => { selections[index] = order.slice(); rerender(); }, 'primary');
      const clear = button(ui[11], () => { order = []; rerender(); });
      check.disabled = order.length !== choices.length;
      clear.disabled = order.length === 0;
      controls.append(check, clear);
      question.append(controls);
    }
  }

  if (answered) {
    const feedback = node('div', undefined, 'quiz-feedback');
    feedback.setAttribute('role', 'status');
    feedback.append(node('strong', correct(index, value) ? ui[4] : ui[5]), node('p', explanation));
    question.append(feedback, button(index === answers.length - 1 ? ui[7] : ui[6], () => {
      index += 1;
      order = [];
      rerender();
    }, 'primary'));
  }

  const tip = node('aside');
  tip.append(node('h2', ui[3]), node('p', hint));
  layout.append(question, tip);
  quiz.append(layout);
}
language.addEventListener('change', () => {
  locale = language.value;
  try { localStorage.setItem('abduls-pharma-locale', locale); } catch {}
  render();
});
render();
}
