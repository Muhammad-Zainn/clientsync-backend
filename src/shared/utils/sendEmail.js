const { Resend } = require("resend");
const Tenant = require("../../modules/tenants/tenant.model");

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * 1. For invited users (Team/Clients) setting up their account
 */
const sendInviteSetupEmail = async (
  tenantId,
  email,
  fullName,
  role,
  rawToken
) => {
  const tenant = await Tenant.findById(tenantId);
  const agencyName = tenant ? tenant.name : "Agency Portal";
  
  // Notice we use setup-password with the token instead of /login
  const setupUrl = `${process.env.FRONTEND_URL}/setup-password?token=${encodeURIComponent(rawToken)}`;
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
            
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #8C8880;">ACCOUNT SETUP</p>
            <p style="margin: 0; font-size: 14px; color: #59564F;">Please click the button below to set your permanent password. This link will expire in 30 minutes.</p>
          </div>

          <div style="margin-top: 24px;">
            <a href="${setupUrl}" style="display: inline-block; background-color: #1C1B1A; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Set Password & Log In
            </a>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend API Error:", error);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  } catch (error) {
    console.error("Email Sending Error:", error);
    // Rethrowing ensures the API fails immediately if the email bounces
    throw error; 
  }
};

/**
 * 2. For the Agency Admin verifying their initial sign-up
 */
const sendVerificationEmail = async (email, fullName, rawToken) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;

  try {
    const { data, error } = await resend.emails.send({
      from: "ClientSync <onboarding@client-sync.app>",
      to: [email],
      subject: "Welcome to ClientSync - Verify your email",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ECEAE3; border-radius: 12px; background-color: #FAF9F5;">
          <h2 style="color: #1C1B1A; margin-top: 0;">Welcome to ClientSync, ${fullName}!</h2>
          <p style="color: #59564F; font-size: 14px;">
            Thanks for creating your agency account. Please verify your email address to get started. This link will expire in 24 hours.
          </p>
          
          <div style="margin-top: 24px;">
            <a href="${verifyUrl}" style="display: inline-block; background-color: #1C1B1A; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Verify Email Address
            </a>
          </div>
        </div>
      `,
    });

    if (error) {
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  } catch (error) {
    console.error("Email Sending Error:", error);
    throw error;
  }
};

module.exports = { 
  sendInviteSetupEmail, 
  sendVerificationEmail 
};