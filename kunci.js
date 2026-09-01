import crypto from 'crypto';
import fs from 'fs';

const FULL_HTML = fs.readFileSync('snake.html', 'utf8');

const key1 = crypto.createHash('sha256').update("JH-FIONY-SNAKE-GARDEN-2026-LAYER1-SECURE-VAULT").digest();
const iv1 = crypto.randomBytes(16);
const c1 = crypto.createCipheriv('aes-256-gcm', key1, iv1);
let layer1 = c1.update(FULL_HTML, 'utf8', 'base64');
layer1 += c1.final('base64');
const tag1 = c1.getAuthTag().toString('base64');

const key2 = crypto.createHash('sha256').update("FIONY-SNAKE-DOUBLE-ENCRYPTION-FORTRESS-2026-LAYER2").digest();
const iv2 = crypto.randomBytes(16);
const c2 = crypto.createCipheriv('aes-256-cbc', key2, iv2);
let layer2 = c2.update(Buffer.from(iv1.toString('base64') + '|' + tag1 + '|' + layer1, 'utf8'), 'utf8', 'base64');
layer2 += c2.final('base64');

const k1h = key1.toString('hex'), k2h = key2.toString('hex');

const jsCode = `import crypto from 'crypto';

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

export default {
  name: 'snake',
  aliases: ['ular', 'snake', 'jhsnake'],
  tags: 'game',
  description: 'JH Snake — Fiony Garden (level, upgrade, skin, achievement)',

  async run(ctx) {
    try {
      const html = _decrypt();
      if (!html) throw new Error("decrypt failed");

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
      }, {
        additionalAttributes: { type: "text" }
      });

      await ctx.react('🐍');
    } catch (err) {
      await ctx.reply(JSON.stringify({ error: true, message: err?.message || String(err) }));
    }
  }
};`;

fs.writeFileSync('feat/game/snake.js', jsCode);
console.log('✅ snake.js regenerated dari snake.html!');
