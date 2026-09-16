const { Resend } = require("resend");
const Tenant = require("../../modules/tenants/tenant.model");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendWelcomeEmail = async (
  tenantId,
  email,
  fullName,
  tempPassword,
  role,
) => {
  const tenant = await Tenant.findById(tenantId);
  const agencyName = tenant ? tenant.name : "Agency Portal";

  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const readableRole = role.replace("_", " ");

  try {
    const { data, error } = await resend.emails.send({
      from: "ClientSync <onboarding@client-sync.app>",
      to: [email],
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
    });

    if (error) {
      console.error("Resend API Error:", error);
      throw new Error("Failed to send email");
    }
  } catch (error) {
    console.error("Email Sending Error:", error);
    throw error;
  }
};

const sendVerificationEmail = async (email, fullName, code) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "ClientSync <onboarding@client-sync.app>",
      to: [email],
      subject: "Verify your ClientSync Account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ECEAE3; border-radius: 12px; background-color: #FAF9F5;">
          <h2 style="color: #1C1B1A; margin-top: 0;">Verify your email, ${fullName}</h2>
          <p style="color: #59564F; font-size: 14px; line-height: 1.5;">
            You are almost ready to start managing your agency. Please use the 6-digit code below to verify your email address and activate your workspace.
          </p>
          
          <div style="background-color: #ffffff; border: 1px solid #ECEAE3; padding: 24px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #8C8880;">VERIFICATION CODE</p>
            <h1 style="font-size: 36px; font-weight: 700; letter-spacing: 6px; color: #1C1B1A; margin: 0; font-family: monospace;">
              ${code}
            </h1>
          </div>

          <p style="color: #8C8880; font-size: 13px; margin-bottom: 0;">
            This code will expire in 15 minutes. If you did not request this email, you can safely ignore it.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend API Error (Verification):", error);
      throw new Error("Failed to send verification email");
    }
  } catch (error) {
    console.error("Email Sending Error:", error);
    throw error;
  }
};

module.exports = { sendWelcomeEmail, sendVerificationEmail };