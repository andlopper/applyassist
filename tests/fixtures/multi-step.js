const stepOne = document.getElementById("step-one");
const stepTwo = document.getElementById("step-two");
const continueButton = document.getElementById("continue");

continueButton.addEventListener("click", () => {
  stepOne.hidden = true;
  stepTwo.hidden = false;
});
