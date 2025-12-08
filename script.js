// ----- MANAGE TAB BUTTONS LOGIC -----
const manageButtons = document.querySelectorAll(".manage-item");

function showToast(msg){
  alert(msg);
}

manageButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const title = btn.querySelector(".manage-title").textContent;

    showToast(`Opening ${title}... (Feature coming soon)`);

    if (title.includes("Store details")) {
        console.log("Open Store Details Modal");
    } else if (title.includes("Payment methods")) {
        console.log("Open Payment Settings");
    }
  });
});
