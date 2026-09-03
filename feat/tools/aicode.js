/**
 * © JamvanHax0r — Fiony Bot
 * Hapus credit gak bikin u jago dumbass. 
 * Hargai sebagaimana u mau dihargai.
 * aicode.js — Fiony AI File Protocol
 * ambil file bot, kirim sebagai rich response
 * (teks + code block syntax-highlighted + tabel ringkasan + footer)
*/

import fs from 'node:fs';
import path from 'node:path';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'async', 'await', 'return', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'import',
  'export', 'from', 'default', 'class', 'extends', 'new', 'try', 'catch',
  'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void',
  'yield', 'static', 'get', 'set', 'this', 'super', 'null', 'undefined',
  'true', 'false'
]);

const LANGS = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', html: 'html', htm: 'html',
  py: 'python', md: 'markdown', sh: 'bash',
  yml: 'yaml', yaml: 'yaml', ts: 'typescript'
};

// Tokenizer sederhana -> highlightType proto WA:
// 0 default • 1 keyword • 2 method • 3 string • 4 number • 5 comment
function tokenize(code) {
  const blocks = [];
  const push = (type, content) => {
    if (!content) return;
    const last = blocks[blocks.length - 1];
    if (last && last.highlightType === type) last.codeContent += content;
    else blocks.push({ highlightType: type, codeContent: content });
  };

  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];

    if (c === '/' && code[i + 1] === '/') {
      let j = i;
      while (j < n && code[j] !== '\n') j++;
      push(5, code.slice(i, j));
      i = j;
      continue;
    }

    if (c === '/' && code[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(code[j] === '*' && code[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      push(5, code.slice(i, j));
      i = j;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      let j = i + 1;
      while (j < n && code[j] !== q) {
        if (code[j] === '\\') j++;
        j++;
      }
      j = Math.min(n, j + 1);
      push(3, code.slice(i, j));
      i = j;
      continue;
    }

    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9._xXa-fA-F]/.test(code[j])) j++;
      push(4, code.slice(i, j));
      i = j;
      continue;
    }

    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < n && (code[k] === ' ' || code[k] === '\t')) k++;
      if (KEYWORDS.has(word)) push(1, word);
      else if (code[k] === '(') push(2, word);
      else push(0, word);
      i = j;
      continue;
    }

    push(0, c);
    i++;
  }
  return blocks;
}

export default {
  name: 'aicode',
  aliases: ['fio', 'ambil'],
  tags: 'tools',
  owner: true,
  description: 'Fiony AI: ambil file & kirim kode dengan format rich response',

  async run(ctx) {
    let input = (ctx.text || '').trim();
    input = input.replace(/^ambil\s+/i, '');
    if (!input) {
      return ctx.reply(
        '🤖 *FIONY AI* — _File Protocol_\n\n' +
        'Mau ambil file apa, bos?\n\n' +
        '*Contoh:*\n.fio feat/game/snake.js'
      );
    }

    const cwd = process.cwd();
    const safe = path.normalize(input).replace(/^(\.\.[\/\\])+/, '');
    const full = path.resolve(cwd, safe);
    if (full !== cwd && !full.startsWith(cwd + path.sep)) {
      return ctx.reply('⚠️ Path di luar direktori bot gak diizinkan.');
    }
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return ctx.reply('❌ File gak ditemukan: `' + safe + '`');
    }

    const raw = fs.readFileSync(full);
    if (raw.includes(0)) {
      return ctx.reply('📦 File terdeteksi biner, gak bisa ditampilkan.');
    }

    let code = raw.toString('utf8');
    const totalLen = code.length;
    const totalLines = code.split('\n').length;

    const MAX = 6000;
    let truncated = false;
    if (code.length > MAX) {
      code = code.slice(0, MAX);
      truncated = true;
    }

    const blocks = tokenize(code);
    if (truncated) {
      blocks.push({
        highlightType: 5,
        codeContent: '\n// … (terpotong — file asli ' + totalLen + ' karakter)'
      });
    }

    const ext = (path.extname(full).slice(1) || 'txt').toLowerCase();
    const lang = LANGS[ext] || ext;
    const name = path.basename(full);

    await ctx.client.message.send(ctx.chat, {
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [
              {
                messageType: 2,
                messageText:
                  '🤖 *FIONY AI* — _File Protocol_\n' +
                  '✅ File `' + name + '` sudah diambil lengkap!\n\n' +
                  '📄 *Isi File:*'
              },
              {
                messageType: 5,
                codeMetadata: {
                  codeLanguage: lang,
                  codeBlocks: blocks
                }
              },
              {
                messageType: 4,
                tableMetadata: {
                  title: 'Ringkasan File',
                  rows: [
                    { items: ['Properti', 'Nilai'], isHeading: true },
                    { items: ['Nama', name], isHeading: false },
                    { items: ['Path', safe], isHeading: false },
                    { items: ['Bahasa', lang], isHeading: false },
                    { items: ['Ukuran', (totalLen / 1024).toFixed(1) + ' KB'], isHeading: false },
                    { items: ['Baris', String(totalLines)], isHeading: false }
                  ]
                }
              },
              {
                messageType: 2,
                messageText: '\n> _*Made with♡ by JamvanHax0r*_\n> _*Powered by FionyVerse*_'
              }
            ],
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
              forwardOrigin: 4
            }
          }
        }
      }
    }, { additionalAttributes: { type: 'text' } });

    await ctx.react('🤖');
  }
};
