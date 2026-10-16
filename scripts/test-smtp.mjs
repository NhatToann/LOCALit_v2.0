// Test Gmail SMTP connectivity with provided App Password
import nodemailer from 'nodemailer'

const pw = 'ofuu-sngb-cczm-xewm'
const user = 'darklunatv@gmail.com'
const to = 'darklunatv@gmail.com'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user, pass: pw },
  tls: { rejectUnauthorized: true },
})

try {
  const info = await transporter.sendMail({
    from: `"LOCALit Test" <${user}>`,
    to,
    subject: 'SMTP Test from LOCALit - ' + Date.now(),
    text: `App Password test at ${new Date().toISOString()}\nPassword tried: ${pw}`,
    html: `<p>Test at ${new Date().toISOString()}</p><p>Password length: ${pw.length}</p>`,
  })
  console.log('SUCCESS:', info.messageId)
  console.log('Response:', info.response)
} catch (e) {
  console.error('FAILED:', e.code, e.message)
  if (e.response) console.error('SMTP response:', e.response)
}
