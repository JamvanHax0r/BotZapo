/**
 * © JamvanHax0r — Fiony Bot
 * Hapus credit gak bikin u jago dumbass. 
 * Hargai sebagaimana u mau dihargai.
 * fio.js — Fiony AI
 * rich response + vision (quoted & caption) +
 * file protocol + real-time + sesi
 * [UPDATE AND FIX BELOW]
 */
import fs from 'node:fs';
import path from 'node:path';
import { orca, FIONY_PERSONA } from '../../config/ai/orca.js';
import { tokenize, LANGS, parseMarkdown } from '../../lib/highlight.js';

const MAX_CODE = 5000;
const MAX_TEXT = 3500;
const MAX_CTX = 6000;
const MEM = (globalThis.JH_FIO_MEM ??= new Map());
const MEM_CAP = 8;

// ===== [FIX] RICH BUILDERS =====
function codeSubmessage(code, lang) {
  let src = code;
  let truncated = false;
  if (src.length > MAX_CODE) {
    src = src.slice(0, MAX_CODE);
    truncated = true;
  }
  const blocks = tokenize(src);
  if (truncated) blocks.push({ highlightType: 5, codeContent: '\n// … (terpotong)' });
  return {
    messageType: 5,
    codeMetadata: { codeLanguage: LANGS[lang] || lang || 'javascript', codeBlocks: blocks }
  };
}

function tableSubmessage(rows) {
  const clean = rows.map((r, i) => ({ items: r, isHeading: i === 0 }));
  return { messageType: 4, tableMetadata: { rows: clean } };
}

// ===== [FIX] FILE PROTOCOL FLEKSIBEL =====
const SKIP_DIR = new Set(['node_modules', '.git', 'session', 'tmp', 'dist', 'coverage']);

function walk(dir, out = [], depth = 0) {
  if (depth > 5) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIR.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else out.push(p);
  }
  return out;
}

function detectFile(query) {
  const m =
    query.match(/([\w@.-]+(?:\/[\w@.-]+)+\.(?:js|mjs|cjs|json|html?|py|md|sh|ya?ml|ts))/i) ||
    query.match(/([\w@.-]+\.(?:js|mjs|cjs|json|html?|py|md|sh|ya?ml|ts))/i);
  if (!m) return null;

  const cwd = process.cwd();
  const want = path.normalize(m[1]);
  const wantBase = path.basename(want).toLowerCase();

  const candidates = [path.resolve(cwd, want)];
  for (const f of walk(cwd)) {
    const rel = path.relative(cwd, f);
    if (rel.endsWith(want) || path.basename(f).toLowerCase() === wantBase) {
      candidates.push(f);
    }
  }

  for (const c of candidates) {
    if (c !== cwd && c.startsWith(cwd + path.sep)) {
      try {
        if (!fs.statSync(c).isFile()) continue;
        const raw = fs.readFileSync(c);
        if (raw.includes(0)) continue;
        return {
          safe: path.relative(cwd, c),
          name: path.basename(c),
          code: raw.toString('utf8'),
          ext: (path.extname(c).slice(1) || 'txt').toLowerCase()
        };
      } catch {}
    }
  }
  return null;
}

// ===== [UPDATE] VISION: caption mode + quoted mode (downloadBytes terima raw IMessage) =====
async function extractImage(ctx) {
  const msg = ctx.event?.message;
  if (!msg) return null;

  // [UPDATE] 1) Kirim foto langsung + caption .fio ...
  if (msg.imageMessage) {
    try {
      const buf = await ctx.client.message.downloadBytes(msg, { maxBytes: 6 * 1024 * 1024 });
      if (buf && buf.length) {
        const mime = (msg.imageMessage.mimetype || 'image/jpeg').split(';')[0];
        return 'data:' + mime + ';base64,' + buf.toString('base64');
      }
    } catch {}
  }

  // [UPDATE] 2) Reply foto + .fio ...
  const ci = msg.extendedTextMessage?.contextInfo || null;
  const qm = ci?.quotedMessage;
  if (qm && qm.imageMessage) {
    try {
      const buf = await ctx.client.message.downloadBytes(qm, { maxBytes: 6 * 1024 * 1024 });
      if (buf && buf.length) {
        const mime = (qm.imageMessage.mimetype || 'image/jpeg').split(';')[0];
        return 'data:' + mime + ';base64,' + buf.toString('base64');
      }
    } catch {}
  }

  return null;
}

// ===== [UPDATE] LIVE: baca URL =====
async function readUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FionyBot/1.0)' },
      redirect: 'follow'
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    const raw = await res.text();
    if (!type.includes('html')) return raw.slice(0, MAX_CTX);

    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text.slice(0, MAX_CTX);
  } catch {
    return null;
  }
}

function realTimeContext() {
  const now = new Date();
  const hari = now.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
  const tgl = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const jam = now.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  return (
    '\n\nKONTEKS WAKTU REAL-TIME: Hari ini ' + hari + ', ' + tgl +
    ', jam ' + jam + ' (zona Asia/Jakarta). Pakai ini kalau ditanya soal waktu, tanggal, atau kabar terbaru.'
  );
}

export default {
  name: 'fio',
  aliases: ['ai', 'fiony', 'tanya'],
  tags: 'ai',
  description: 'Ngobrol sama Fiony AI',

  async run(ctx) {
    const query = (ctx.text || '').trim();

    if (/^(reset|mulai( ulang)?|lupakan)/i.test(query)) {
      MEM.delete(ctx.sender);
      return ctx.reply('🧠 Sesi Fiony di-reset. Mulai obrolan baru yuk!');
    }

    const image = await extractImage(ctx);

    if (!query && !image) {
      return ctx.reply(
        '🤖 *FIONY AI*\n\n' +
        'Mau ngobrol apa, King?\n\n' +
        '*Contoh:*\n' +
        '• `.fio siapa kamu?`\n' +
        '• `.fio ambil file math.js`\n' +
        '• `.fio rangkum https://...`\n' +
        '• Reply foto + `.fio ini foto apa?`\n' +
        '• Kirim foto + caption `.fio ini apa?`\n' +
        '• `.fio reset` (mulai sesi baru)'
      );
    }

    await ctx.react('🤖');

    try {
      const toolContext = [];

      const file = (query && ctx.isOwner) ? detectFile(query) : null;
      if (file) {
        toolContext.push('FILE INTERNAL BOT: ' + file.safe + '\n"""\n' + file.code.slice(0, MAX_CTX) + '\n"""');
      }

      const urlMatch = query && query.match(/https?:\/\/\S+/i);
      if (urlMatch) {
        const page = await readUrl(urlMatch[0]);
        if (page) toolContext.push('KONTEN URL ' + urlMatch[0] + ':\n' + page);
      }

      const messages = [{ role: 'system', content: FIONY_PERSONA + realTimeContext() }];

      const hist = MEM.get(ctx.sender) || [];
      messages.push(...hist);

      if (toolContext.length) {
        messages.push({
          role: 'system',
          content: 'KONTEKS LIVE (hasil tools, pakai sebagai rujukan):\n\n' + toolContext.join('\n\n')
        });
      }

      let userContent;
      if (image && query) userContent = orca.visionMessage(image, query);
      else if (image) userContent = orca.visionMessage(image, 'Deskripsiin gambar ini detail dalam bahasa Indonesia.');
      else userContent = { role: 'user', content: query };
      messages.push(userContent);

      const result = await orca.chat(messages, { enable_reasoning: true, max_tokens: 2000 });

      const newHist = MEM.get(ctx.sender) || [];
      newHist.push({ role: 'user', content: query || '[user mengirim gambar]' });
      newHist.push({ role: 'assistant', content: (result.text || '').slice(0, 1200) });
      while (newHist.length > MEM_CAP) newHist.shift();
      MEM.set(ctx.sender, newHist);

      const submessages = [];
      submessages.push({
        messageType: 2,
        messageText:
          '🤖 *FIONY AI* — _' + (image ? 'Vision Mode' : 'Chat Mode') + '_' +
          (file ? '\n📎 File Protocol aktif' : '') +
          (toolContext.length && !file ? '\n🌐 Live context aktif' : '')
      });

      for (const part of parseMarkdown(result.text)) {
        if (part.type === 'text') {
          submessages.push({ messageType: 2, messageText: part.text.trim().slice(0, MAX_TEXT) });
        } else if (part.type === 'code') {
          submessages.push(codeSubmessage(part.code, part.lang));
        } else if (part.type === 'table') {
          submessages.push(tableSubmessage(part.rows));
        }
      }

      if (file) {
        submessages.push({ messageType: 2, messageText: '📄 *Isi File:* `' + file.name + '`' });
        submessages.push(codeSubmessage(file.code, file.ext));
        submessages.push({
          messageType: 4,
          tableMetadata: {
            title: 'Ringkasan File',
            rows: [
              { items: ['Properti', 'Nilai'], isHeading: true },
              { items: ['Nama', file.name], isHeading: false },
              { items: ['Path', file.safe], isHeading: false },
              { items: ['Bahasa', LANGS[file.ext] || file.ext], isHeading: false },
              { items: ['Ukuran', (file.code.length / 1024).toFixed(1) + ' KB'], isHeading: false },
              { items: ['Baris', String(file.code.split('\n').length)], isHeading: false }
            ]
          }
        });
      }

      submessages.push({
        messageType: 2,
        messageText: '\n> _*Made with♡ by JamvanHax0r*_\n> _*Powered by FionyVerse*_'
      });

      await ctx.client.message.send(ctx.chat, {
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages,
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

      await ctx.react('✨');
    } catch (e) {
      await ctx.react('❎');
      const msg = String(e.message || e);
      if (msg.includes('PROVIDER_BUSY')) {
        return ctx.reply('⚠️ Provider AI-nya lagi penuh/down untuk saat ini. Coba ulang beberapa menit lagi ya, Kak.');
      }
      ctx.reply('*Maaf Error:* ' + msg.slice(0, 300));
    }
  }
};
