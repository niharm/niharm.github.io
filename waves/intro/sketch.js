function setup() {
  createCanvas(windowWidth, windowHeight);
  background(40);
  textSize(width/10); // TODO: set maximum here
  fill('white');
  textAlign(CENTER);
  text('where are you?', width/2,height/10);

  fill('red');
  rect(width/6, height/5, width/6, 3*height/5);
  fill('green');
  rect(2*width/6, height/5, width/6, 3*height/5);
  fill('yellow');
  rect(3*width/6, height/5, width/6, 3*height/5);
  fill('orange');
  rect(4*width/6, height/5, width/6, 3*height/5);


  draw
}

function draw() {
  fill(0);
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
      background('yellow'); 
    }

    else if ((touchX > 4*width/6) && (touchX < 5*width/6)) {
      background('orange'); 
    }
  }
}
