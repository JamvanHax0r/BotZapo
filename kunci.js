import crypto from 'crypto';
import fs from 'fs';
import { exec } from 'node:child_process';
import util from 'node:util';

const execPromise = util.promisify(exec);
const FULL_HTML = fs.readFileSync('music.html', 'utf8');

// ===== LAYER 1: AES-256-GCM =====
const key1 = crypto.createHash('sha256').update("JH-FIONY-MUSIC-2026-LAYER1-SECURE-VAULT").digest();
const iv1 = crypto.randomBytes(16);
const c1 = crypto.createCipheriv('aes-256-gcm', key1, iv1);
let layer1 = c1.update(FULL_HTML, 'utf8', 'base64');
layer1 += c1.final('base64');
const tag1 = c1.getAuthTag().toString('base64');

// ===== LAYER 2: AES-256-CBC =====
const key2 = crypto.createHash('sha256').update("FIONY-MUSIC-DOUBLE-ENCRYPTION-FORTRESS-2026-LAYER2").digest();
const iv2 = crypto.randomBytes(16);
const c2 = crypto.createCipheriv('aes-256-cbc', key2, iv2);
let layer2 = c2.update(Buffer.from(iv1.toString('base64') + '|' + tag1 + '|' + layer1, 'utf8'), 'utf8', 'base64');
layer2 += c2.final('base64');

const k1h = key1.toString('hex'), k2h = key2.toString('hex');

const jsCode = `import crypto from 'crypto';
import fs from 'fs';
import { exec } from 'node:child_process';
import util from 'node:util';
import { jhydl } from '../../scraper/YT-DL.js';

const execPromise = util.promisify(exec);
const SESSIONS = (globalThis.JH_PLAY_SESSIONS ??= new Map());

// Budget: total payload harus < 1MB (batas fitur rich response, sesuai reference)
const BUDGET_COMPRESSED = 500000;

const _P2="${layer2}";
const _V2="${iv2.toString('base64')}";
const _K1_1="${k1h.substring(0,16)}",_K1_2="${k1h.substring(16,32)}",_K1_3="${k1h.substring(32,48)}",_K1_4="${k1h.substring(48,64)}";
const _K2_1="${k2h.substring(0,16)}",_K2_2="${k2h.substring(16,32)}",_K2_3="${k2h.substring(32,48)}",_K2_4="${k2h.substring(48,64)}";

function _b64(s){return Buffer.from(s,"base64")}
function _h2b(h){const r=[];for(let i=0;i<h.length;i+=2)r.push(parseInt(h.substr(i,2),16));return Buffer.from(r)}
function _decrypt(){
  const k2=Buffer.concat([_h2b(_K2_1),_h2b(_K2_2),_h2b(_K2_3),_h2b(_K2_4)]);
  try{
    const d2=crypto.createDecipheriv("aes-256-cbc",k2,_b64(_V2));
    const [iv1b,tag1b,l1b]=Buffer.concat([d2.update(_b64(_P2)),d2.final()]).toString("utf-8").split("|");
    const k1=Buffer.concat([_h2b(_K1_1),_h2b(_K1_2),_h2b(_K1_3),_h2b(_K1_4)]);
    const d1=crypto.createDecipheriv("aes-256-gcm",k1,_b64(iv1b));
    d1.setAuthTag(_b64(tag1b));
    return Buffer.concat([d1.update(_b64(l1b)),d1.final()]).toString("utf-8");
  }catch(e){return ""}
}

const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parseDur=(s)=>{
  const p=String(s||'').split(':').map(Number);
  if(p.some(isNaN)||!p.length)return 0;
  return p.reduce((a,b)=>a*60+b,0);
};

async function compressAudio(buf, totalSeconds, videoId) {
  const ts = Date.now();
  const tempIn = '/tmp/in_' + videoId + '_' + ts + '.mp3';
  const tempOut = '/tmp/out_' + videoId + '_' + ts + '.mp3';
  fs.writeFileSync(tempIn, buf);

  try {
    // Paksa encoder libmp3lame (biar -b:a gak di-ignore / stream-copy)
    // Turun bertahap sampe masuk budget
    const steps = totalSeconds <= 240 ? [24, 16, 12] : [16, 12, 8];
    let out = null;
    for (const kb of steps) {
      const ar = kb <= 16 ? 16000 : 22050;
      try {
        await execPromise(\`ffmpeg -y -i "\${tempIn}" -c:a libmp3lame -ac 1 -ar \${ar} -b:a \${kb}k -f mp3 "\${tempOut}"\`);
        out = fs.readFileSync(tempOut);
      } catch (e) {
        out = null;
        break;
      }
      console.log('[MUSIC] try ' + kb + 'k =>', (out.length / 1024).toFixed(0), 'KB');
      if (out.length <= BUDGET_COMPRESSED) break;
    }
    if (!out) throw new Error('ffmpeg libmp3lame gak tersedia di server');
    if (out.length > BUDGET_COMPRESSED) {
      throw new Error('Lagu terlalu panjang: ' + (out.length / 1024).toFixed(0) + 'KB setelah compress (budget 500KB).');
    }
    return out;
  } finally {
    if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
    if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
  }
}

export default {
  name: 'pick',
  aliases: ['pilih'],
  tags: 'downloader',
  description: 'Pilih hasil pencarian .play dan putar audionya',

  async run(ctx) {
    const sess = SESSIONS.get(ctx.sender);
    if (!sess) return ctx.reply('Sesi pencarian gak ditemukan. Ketik *.play <judul>* dulu.');

    const n = parseInt(ctx.text, 10);
    if (!n || n < 1 || n > sess.results.length) {
      return ctx.reply('Nomor tidak valid. Pilih 1-' + sess.results.length + '.');
    }

    const v = sess.results[n - 1];
    await ctx.react('⏳');

    try {
      const data = await jhydl.download(v.url, 'mp3');
      if (!data || data.error) throw new Error(data?.error || 'Gagal mengunduh audio.');

      const fr = await fetch(data.download_url);
      if (!fr.ok) throw new Error('Gagal mengambil audio: ' + fr.status);
      const rawBuf = Buffer.from(await fr.arrayBuffer());
      console.log('[MUSIC] Raw:', (rawBuf.length / 1048576).toFixed(2), 'MB');

      const totalSeconds = parseDur(v.duration) || 240;
      const compressedBuf = await compressAudio(rawBuf, totalSeconds, v.id || 'audio');
      const audioBase64 = 'data:audio/mpeg;base64,' + compressedBuf.toString('base64');

      const ytimg = v.id ? ('https://i.ytimg.com/vi/' + v.id + '/default.jpg') : '';
      let thumb = '';
      try {
        const tr = await fetch(ytimg);
        if (tr.ok) {
          const tb = Buffer.from(await tr.arrayBuffer());
          if (tb.length > 0 && tb.length < 60 * 1024) thumb = 'data:image/jpeg;base64,' + tb.toString('base64');
        }
      } catch (e) {}

      let html = _decrypt();
      if (!html) throw new Error('decrypt failed');

      html = html
        .split('__JH_TITLE__').join(esc(data.title || v.title))
        .split('__JH_ARTIST__').join(esc(v.artist || ''))
        .split('__JH_DURATION__').join(esc(v.duration || '-'))
        .split('__JH_NOTE__').join(esc('Tap ▶ to play'))
        .split('__JH_THUMB__').join(thumb || esc(ytimg))
        .split('__JH_AUDIO__').join(audioBase64);

      console.log('[MUSIC] Final payload:', (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0), 'KB');

      await ctx.client.message.send(ctx.chat, {
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              unifiedResponse: {
                data: Buffer.from(JSON.stringify({
                  __typename: "GenAIUnifiedResponse",
                  response_id: crypto.randomUUID(),
                  sections: [{
                    __typename: "GenAIUnifiedResponseSection",
                    view_model: {
                      __typename: "GenAISingleLayoutViewModel",
                      primitive: {
                        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
                        trusted_sources: [],
                        payload: html
                      }
                    }
                  }]
                })).toString("base64")
              },
              contextInfo: {
                isForwarded: true,
                forwardOrigin: 4
              }
            }
          }
        }
      }, { additionalAttributes: { type: "text" } });

      SESSIONS.delete(ctx.sender);
      await ctx.react('✅');
    } catch (e) {
      await ctx.react('❎');
      ctx.reply('*Maaf Error:* ' + (e.message || e));
    }
  }
};`;

fs.writeFileSync('feat/downloader/pick.js', jsCode);
console.log('✅ pick.js (music) regenerated — forced libmp3lame + budget 1MB!');
