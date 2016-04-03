function setup() {
  createCanvas(windowWidth, windowHeight);
  background(40);
  textSize(width/10); // TODO: set maximum here
  fill('white');
  textAlign(CENTER);
  text('where are you?', width/2,height/10);


  fill('red');
  quad(2*width/8, height/3, 3*width/8,height/3, 2*width/6, 2*height/3, width/6, 2*height/3)
  fill('green');
  quad(3*width/8, height/3, 4*width/8,height/3, 3*width/6, 2*height/3, 2*width/6, 2*height/3)
  fill('blue');
  quad(4*width/8, height/3, 5*width/8,height/3, 4*width/6, 2*height/3, 3*width/6, 2*height/3)
  fill('yellow');
  quad(5*width/8, height/3, 6*width/8,height/3, 5*width/6, 2*height/3, 4*width/6, 2*height/3)

}

function draw() {
  fill(0);
}

function touchStarted() {
  // empty to make sure screen won't be pulled around
}

function touchEnded() {

  if ((touchY > height/5) && (touchY < 4*height/5)) {

    if ((touchX > width/6) && (touchX < 2*width/6)) {
      background('red'); 
    }

    else if ((touchX > 2*width/6) && (touchX < 3*width/6)) {
      background('green'); 
    }

    else if ((touchX > 3*width/6) && (touchX < 4*width/6)) {
      console.log(3*width/6);
      background('blue'); 
    }

    else if ((touchX > 4*width/6) && (touchX < 5*width/6)) {
      background('yellow'); 
    }
  }
}
