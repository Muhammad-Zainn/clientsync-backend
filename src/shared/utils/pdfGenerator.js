const puppeteer = require("puppeteer");
const ejs = require("ejs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.generatePDF = async (templateName, data) => {
  try {
    const templatePath = path.join(
      __dirname,
      "..",
      "templates",
      `${templateName}.ejs`
    );

    const htmlContent = await ejs.renderFile(templatePath, data);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });


    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
    });

    await browser.close();

    const fileName = `${templateName}-${Date.now()}.pdf`;


    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("proposals")
      .upload(`pdfs/${fileName}`, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      throw new Error("Failed to upload PDF to Supabase");
    }

    const { data: publicUrlData } = supabase.storage
      .from("proposals")
      .getPublicUrl(`pdfs/${fileName}`);

    return publicUrlData.publicUrl;
    
  } catch (error) {
    console.error("PDF Generation Error: ", error);
    throw new Error("Could not generate PDF");
  }
};