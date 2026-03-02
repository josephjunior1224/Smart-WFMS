const generateBtn = document.getElementById("generateBtn");
const scanBtn = document.getElementById("scanBtn");
const qrcodeContainer = document.getElementById("qrcode");
const result = document.getElementById("result");

let generatedData = null;

generateBtn.addEventListener("click", () => {
  const name = document.getElementById("name").value.trim();
  const id = document.getElementById("id").value.trim();

  if (!name || !id) {
    alert("Please enter worker name and ID");
    return;
  }

  generatedData = JSON.stringify({ name, id });

  qrcodeContainer.innerHTML = "";
  new QRCode(qrcodeContainer, {
    text: generatedData,
    width: 200,
    height: 200,
  });

  result.innerHTML = "QR Code Generated. Scan to login.";
});

scanBtn.addEventListener("click", () => {
  if (!generatedData) {
    alert("Generate QR first!");
    return;
  }

  // Start QR scanner
  const html5QrCode = new Html5Qrcode("qr-reader");
  document.getElementById("result").innerHTML = "<div id='qr-reader' style='width: 300px; margin-top: 20px;'></div>";

  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      if (decodedText === generatedData) {
        html5QrCode.stop();
        result.innerHTML = "<p style='color:green;'>Login Successful!</p>";
      } else {
        result.innerHTML = "<p style='color:red;'>Invalid QR Code!</p>";
      }
    },
    (error) => {
      console.log(error);
    }
  );
});
