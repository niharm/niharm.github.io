function setup() {

  createCanvas(windowWidth, windowHeight);


}

function draw() {
  fill(0);
}

function touchStarted() {
  ellipse(touchX, touchY, 5, 5);
  // prevent default
  return false;

  text(touchX, 20,20);

}
