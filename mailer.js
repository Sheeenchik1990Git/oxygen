import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const hasSmtp = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (Number(process.env.SMTP_PORT) || 465) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

export async function sendVerificationCode(email, code) {
  if (!transporter) {
    console.log('====================================');
    console.log(`[OxyGen] Код подтверждения для ${email}: ${code}`);
    console.log('====================================');
    return { mode: 'console' };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: `${code} — ваш код подтверждения OxyGen`,
    text: `Добро пожаловать в OxyGen! Ваш код подтверждения: ${code}. Он действителен 10 минут.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; background: #070b14; color: #f8fafc; border-radius: 16px;">
        <h2 style="margin: 0 0 8px; color: #38bdf8;">OxyGen</h2>
        <p style="margin: 0 0 24px; color: #94a3b8; font-size: 14px;">Глоток свежего воздуха в рутине</p>
        <p style="margin: 0 0 12px;">Ваш код для завершения регистрации:</p>
        <div style="display: inline-block; padding: 14px 28px; font-size: 32px; font-weight: 700; letter-spacing: 8px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 12px; color: #7dd3fc;">
          ${code}
        </div>
        <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">Код действителен 10 минут.</p>
      </div>
    `,
  });

  return { mode: 'smtp' };
}
