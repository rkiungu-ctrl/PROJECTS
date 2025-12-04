# 📧 EMAIL SETUP GUIDE FOR PAYSLIP SYSTEM

This payslip system can work with any email provider. Here's how to configure it for your company:

## 🚀 Quick Setup Steps

1. **Copy Configuration Template**
   ```
   Copy .env.example to .env
   ```

2. **Choose Your Email Provider** (see options below)

3. **Fill in Your Settings** in the `.env` file

4. **Test Email Functionality** using the Email button in payslip modal

---

## 📧 Provider-Specific Setup Instructions

### 🔴 **GMAIL** (Most Popular)
**Best for:** Google Workspace, Gmail accounts

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=hr@yourcompany.com
SMTP_PASS=your-app-password-here
SMTP_FROM=hr@yourcompany.com
```

**Setup Steps:**
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Factor Authentication
3. Generate App Password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Select "Mail" as the app
5. Copy the 16-character password to `SMTP_PASS`

---

### 🔵 **OUTLOOK/HOTMAIL** (Microsoft)
**Best for:** Office 365, Outlook.com accounts

```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=hr@yourcompany.com
SMTP_PASS=your-outlook-password
SMTP_FROM=hr@yourcompany.com
```

**Setup Steps:**
1. Use your regular Outlook password
2. May need to enable "Less secure app access"
3. Check Outlook SMTP settings if issues occur

---

### 🟡 **YAHOO MAIL**
**Best for:** Yahoo Business Email

```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=465
SMTP_USER=hr@yourcompany.com
SMTP_PASS=your-yahoo-app-password
SMTP_FROM=hr@yourcompany.com
```

**Setup Steps:**
1. Enable 2-Factor Authentication in Yahoo
2. Go to Yahoo Account Security
3. Generate App Password for "Mail"
4. Use App Password (not regular password)

---

### 🟢 **CUSTOM BUSINESS EMAIL**
**Best for:** company@yourdomain.com emails

```env
SMTP_HOST=mail.yourcompany.com
SMTP_PORT=587
SMTP_USER=hr@yourcompany.com
SMTP_PASS=your-business-password
SMTP_FROM=hr@yourcompany.com
```

**Setup Steps:**
1. Contact your IT department or web hosting provider
2. Request SMTP server details:
   - SMTP server address
   - Port (usually 587 for TLS, 465 for SSL)
   - Authentication requirements
3. Test with your email client first

---

## 🧪 Testing Your Configuration

1. **Start the payslip system**
2. **Open a payslip** for any employee with an email address
3. **Click the "Email" button**
4. **Check the server console** for detailed logs:
   - ✅ "Email sent successfully" = Working!
   - ❌ Error messages = Check configuration

---

## 🔧 Troubleshooting

### Common Issues:

**"Authentication failed"**
- Gmail/Yahoo: Use App Password, not regular password
- Outlook: Check if 2FA is interfering

**"Connection refused"**
- Check SMTP_HOST and SMTP_PORT
- Verify firewall isn't blocking outgoing email

**"Email not configured"**
- Ensure .env file exists in AccountingSystem folder
- Check all required fields are filled

**"Employee has no email"**
- Add email address to employee profile
- Check email field in employee data

---

## 📋 Email Features

✅ **Password-protected PDF** attachment  
✅ **Professional email template**  
✅ **Salary summary** in email body  
✅ **Company branding**  
✅ **Employee-specific passwords** (National ID)  
✅ **Background processing** (won't slow down UI)  

---

## 🏢 For System Administrators

- Each company can use different email providers
- Configuration is per-installation (not per-company in database)
- Passwords are stored in environment variables (secure)
- Email sending happens in background (non-blocking)
- Full logging for troubleshooting

---

**Need Help?** Check server console logs for detailed error messages.