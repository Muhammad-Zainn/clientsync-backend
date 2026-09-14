const nodemailer = require("nodemailer");
const Tenant = require("../../modules/tenants/tenant.model");

const sendWelcomeEmail = async (tenantId, email, fullName, tempPassword, role) => {
  const tenant = await Tenant.findById(tenantId);
  const agencyName = tenant ? tenant.name : "Agency Portal";

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, 
    },
  });

  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const readableRole = role.replace("_", " ");

  const mailOptions = {
    from: `"${agencyName}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Your account for ${agencyName} is ready`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ECEAE3; border-radius: 12px; background-color: #FAF9F5;">
        <h2 style="color: #1C1B1A; margin-top: 0;">Welcome aboard, ${fullName}!</h2>
        <p style="color: #59564F; font-size: 14px;">
          An account has been created for you as an <strong>${readableRole}</strong> at ${agencyName}.
        </p>
        
        <div style="background: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #ECEAE3; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #8C8880;">EMAIL ADDRESS</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: bold; color: #1C1B1A; font-family: monospace;">${email}</p>
          
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #8C8880;">TEMPORARY PASSWORD</p>
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #1C1B1A; font-family: monospace; letter-spacing: 1px;">${tempPassword}</p>
        </div>

        <div style="margin-top: 24px;">
          <a href="${loginUrl}" style="display: inline-block; background-color: #1C1B1A; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Log In Now
          </a>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendWelcomeEmail };