function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);
}

function draw() {
  fill(0);
}

function touchEnded() {
  background(0);
  ellipse(touchX, touchY, 50, 50);
  // prevent default
  fill('white');
  textSize(50);
  text(touchX, 20,20);
  text(ptouchX, 20,100);
  return false;

}
