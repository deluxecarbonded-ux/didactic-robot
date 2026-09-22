#!/usr/bin/env node
/* Generate locale packs without changing application code. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const outDir = path.join(root, "assets", "locales");

const locales = [
  ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"],
  ["pt", "Portuguese"], ["pt-BR", "Portuguese (Brazil)"], ["pt-PT", "Portuguese (Portugal)"], ["ru", "Russian"],
  ["uk", "Ukrainian"], ["pl", "Polish"], ["nl", "Dutch"], ["sv", "Swedish"], ["no", "Norwegian"], ["da", "Danish"],
  ["fi", "Finnish"], ["cs", "Czech"], ["sk", "Slovak"], ["hu", "Hungarian"], ["ro", "Romanian"], ["bg", "Bulgarian"],
  ["el", "Greek"], ["tr", "Turkish"], ["ar", "Arabic"], ["ar-EG", "Arabic (Egypt)"], ["ar-SA", "Arabic (Saudi Arabia)"],
  ["ar-AE", "Arabic (United Arab Emirates)"], ["ar-MA", "Arabic (Morocco)"], ["he", "Hebrew"], ["fa", "Persian"], ["ur", "Urdu"],
  ["hi", "Hindi"], ["bn", "Bangla"], ["ta", "Tamil"], ["te", "Telugu"], ["mr", "Marathi"], ["gu", "Gujarati"],
  ["kn", "Kannada"], ["ml", "Malayalam"], ["pa", "Punjabi"], ["th", "Thai"], ["vi", "Vietnamese"], ["id", "Indonesian"],
  ["ms", "Malay"], ["fil", "Filipino"], ["zh", "Chinese"], ["zh-CN", "Chinese (Simplified)"], ["zh-TW", "Chinese (Traditional)"],
  ["ja", "Japanese"], ["ko", "Korean"], ["sw", "Swahili"], ["am", "Amharic"], ["zu", "Zulu"], ["xh", "Xhosa"],
  ["yo", "Yoruba"], ["ig", "Igbo"], ["ha", "Hausa"], ["af", "Afrikaans"], ["sq", "Albanian"], ["eu", "Basque"],
  ["ca", "Catalan"], ["gl", "Galician"], ["is", "Icelandic"], ["ga", "Irish"], ["cy", "Welsh"], ["et", "Estonian"],
  ["lv", "Latvian"], ["lt", "Lithuanian"], ["sl", "Slovenian"], ["hr", "Croatian"], ["sr", "Serbian"], ["bs", "Bosnian"],
  ["mk", "Macedonian"], ["mt", "Maltese"], ["la", "Latin"], ["eo", "Esperanto"], ["ka", "Georgian"], ["hy", "Armenian"],
  ["az", "Azerbaijani"], ["kk", "Kazakh"], ["uz", "Uzbek"], ["mn", "Mongolian"], ["ne", "Nepali"], ["si", "Sinhala"],
  ["km", "Khmer"], ["lo", "Lao"], ["my", "Burmese"], ["jv", "Javanese"], ["su", "Sundanese"], ["ceb", "Cebuano"],
  ["haw", "Hawaiian"], ["mi", "Maori"], ["sm", "Samoan"], ["to", "Tongan"], ["fj", "Fijian"], ["mg", "Malagasy"],
  ["so", "Somali"], ["rw", "Kinyarwanda"], ["st", "Southern Sotho"], ["tn", "Tswana"], ["ts", "Tsonga"], ["ve", "Venda"],
  ["sn", "Shona"], ["ny", "Chichewa"], ["lg", "Ganda"], ["wo", "Wolof"], ["yo-NG", "Yoruba (Nigeria)"], ["sw-KE", "Swahili (Kenya)"],
  ["es-MX", "Spanish (Mexico)"], ["es-AR", "Spanish (Argentina)"], ["fr-CA", "French (Canada)"], ["fr-FR", "French (France)"],
  ["de-DE", "German (Germany)"], ["it-IT", "Italian (Italy)"], ["nl-NL", "Dutch (Netherlands)"], ["pl-PL", "Polish (Poland)"],
  ["ru-RU", "Russian (Russia)"], ["ja-JP", "Japanese (Japan)"], ["ko-KR", "Korean (South Korea)"], ["tr-TR", "Turkish (Turkey)"],
  ["hi-IN", "Hindi (India)"], ["bn-BD", "Bangla (Bangladesh)"], ["id-ID", "Indonesian (Indonesia)"], ["vi-VN", "Vietnamese (Vietnam)"],
  ["zh-HK", "Chinese (Hong Kong)"], ["zh-SG", "Chinese (Singapore)"], ["en-GB", "English (United Kingdom)"], ["en-AU", "English (Australia)"],
  ["en-CA", "English (Canada)"], ["en-IN", "English (India)"], ["en-NZ", "English (New Zealand)"], ["es-US", "Spanish (United States)"],
  ["pt-AO", "Portuguese (Angola)"], ["fr-BE", "French (Belgium)"], ["de-AT", "German (Austria)"], ["de-CH", "German (Switzerland)"],
  ["it-CH", "Italian (Switzerland)"], ["ar-DZ", "Arabic (Algeria)"], ["ar-IQ", "Arabic (Iraq)"], ["ar-JO", "Arabic (Jordan)"],
  ["ar-KW", "Arabic (Kuwait)"], ["ar-LB", "Arabic (Lebanon)"], ["ar-LY", "Arabic (Libya)"], ["ar-OM", "Arabic (Oman)"],
  ["ar-QA", "Arabic (Qatar)"], ["ar-TN", "Arabic (Tunisia)"], ["ar-YE", "Arabic (Yemen)"], ["fa-AF", "Persian (Afghanistan)"],
  ["ur-IN", "Urdu (India)"], ["ur-PK", "Urdu (Pakistan)"], ["he-IL", "Hebrew (Israel)"], ["sr-Latn", "Serbian (Latin)"],
  ["sr-Cyrl", "Serbian (Cyrillic)"], ["bs-Latn", "Bosnian (Latin)"], ["ku", "Kurdish"], ["ps", "Pashto"], ["sd", "Sindhi"],
  ["ber", "Tamazight"], ["br", "Breton"], ["co", "Corsican"], ["oc", "Occitan"], ["lb", "Luxembourgish"], ["fy", "Frisian"],
  ["li", "Limburgish"], ["sc", "Sardinian"], ["gd", "Scottish Gaelic"], ["rm", "Romansh"], ["jv-ID", "Javanese (Indonesia)"],
  ["tl-PH", "Tagalog (Philippines)"], ["sw-TZ", "Swahili (Tanzania)"], ["am-ET", "Amharic (Ethiopia)"], ["zu-ZA", "Zulu (South Africa)"],
  ["xh-ZA", "Xhosa (South Africa)"], ["af-ZA", "Afrikaans (South Africa)"], ["ca-ES", "Catalan (Spain)"], ["eu-ES", "Basque (Spain)"],
  ["gl-ES", "Galician (Spain)"], ["cy-GB", "Welsh (United Kingdom)"], ["ga-IE", "Irish (Ireland)"], ["is-IS", "Icelandic (Iceland)"],
  ["et-EE", "Estonian (Estonia)"], ["lv-LV", "Latvian (Latvia)"], ["lt-LT", "Lithuanian (Lithuania)"], ["sk-SK", "Slovak (Slovakia)"],
  ["sl-SI", "Slovenian (Slovenia)"], ["hr-HR", "Croatian (Croatia)"], ["ro-MD", "Romanian (Moldova)"], ["uk-UA", "Ukrainian (Ukraine)"],
  ["el-GR", "Greek (Greece)"], ["cs-CZ", "Czech (Czechia)"], ["hu-HU", "Hungarian (Hungary)"], ["bg-BG", "Bulgarian (Bulgaria)"],
  ["fi-FI", "Finnish (Finland)"], ["sv-FI", "Swedish (Finland)"], ["da-DK", "Danish (Denmark)"], ["no-NO", "Norwegian (Norway)"],
  ["nb-NO", "Norwegian Bokmal"], ["nn-NO", "Norwegian Nynorsk"], ["fo", "Faroese"], ["kl", "Greenlandic"], ["tk", "Turkmen"],
  ["tg", "Tajik"], ["ky", "Kyrgyz"], ["tt", "Tatar"], ["ba", "Bashkir"], ["cv", "Chuvash"], ["sah", "Sakha"],
  ["os", "Ossetian"], ["ab", "Abkhazian"], ["mo", "Moldavian"], ["an", "Aragonese"], ["ast", "Asturian"], ["pap", "Papiamento"],
  ["ht", "Haitian Creole"], ["yo-BJ", "Yoruba (Benin)"], ["ee", "Ewe"], ["ak", "Akan"], ["ff", "Fulah"], ["crh", "Crimean Tatar"]
];

function isRtl(code) { return /^ar(?:-|$)/i.test(code); }
async function sourceStrings() {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && file.endsWith(".js")) files.push(file);
    }
  };
  await walk(path.join(root, "assets", "js"));
  return Promise.all(files.map((file) => readFile(file, "utf8"))).then((contents) => {
    const found = new Set();
    const seeded = ["Home", "Play", "Multi", "Shop", "Profile", "Rankings", "Settings", "How to play", "Language and direction", "Interface language", "Language updated."];
    seeded.forEach((value) => found.add(value));
    for (const content of contents) {
      for (const match of content.matchAll(/(['"])([^\n\r\\]{2,})\1/g)) {
        const value = match[2].trim();
        const human = /[A-Za-z]{2}/.test(value) && /[\s!?.,]/.test(value)
          && !/[{}();=<>$]/.test(value) && !/^(?:https?:|assets\/|#[\w-]+|\.[\w-]+|\/[\w/?#.-]+)$/.test(value)
          && !/^(?:var|function|return|class|typeof|true|false|null|undefined)\b/.test(value);
        if (human) found.add(value);
      }
      for (const match of content.matchAll(/(?:label|title|text|name|blurb|sub|hint|message|placeholder|eyebrow|confirmLabel)\s*:\s*(["'])([^\n\r\\]+?)\1/g)) {
        const value = match[2].trim();
        if (value.length > 1 && !/[{}();=<>$]/.test(value)) found.add(value);
      }
    }
    return [...found].sort();
  });
}

const selectedLocales = locales.slice(0, 150);
const strings = await sourceStrings();
await mkdir(outDir, { recursive: true });
const messages = Object.fromEntries(strings.map((source) => [source, { key: source.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, ""), value: source }]));
const index = selectedLocales.map(([code, name]) => ({ code, name, dir: isRtl(code) ? "rtl" : "ltr", file: `${code}.json` }));
await writeFile(path.join(outDir, "index.json"), JSON.stringify({ source: "en", locales: index, sourceStrings: strings.length, messages }, null, 2) + "\n");
for (const [code, name] of selectedLocales) {
  const translations = Object.fromEntries(strings.map((source) => [source, source]));
  const messageKeys = Object.fromEntries(strings.map((source) => [messages[source].key, source]));
  const pack = { locale: code, name, dir: isRtl(code) ? "rtl" : "ltr", fallback: "en", keys: messageKeys, translations };
  await writeFile(path.join(outDir, `${code}.json`), JSON.stringify(pack, null, 2) + "\n");
}
console.log(`Generated ${selectedLocales.length} locale packs with ${strings.length} source string candidates.`);