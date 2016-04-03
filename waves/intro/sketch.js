function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);
}

function draw() {
  fill(0);
}

function touchStarted() {
  ellipse(touchX, touchY, 5, 5);
  // prevent default
  return false;
  fill('white');
  textSize(20,20);
  text(touchX, 20,20);
  text(ptouchX, 20,100);

}
