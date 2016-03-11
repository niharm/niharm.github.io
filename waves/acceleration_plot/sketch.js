var xPos = 0;

function setup(){
  createCanvas(windowWidth, windowHeight);
  xPos = 0;
  stroke(255);
  strokeWeight(6);
  fill(70);
  
  size = windowHeight/10;
  textSize(size);
  textAlign(CENTER,CENTER);

      background(0);
    noStroke();
    text("X acceleration", windowWidth/2, windowHeight/6);
    text("Y acceleration", windowWidth/2, 3*windowHeight/6);
    text("Z rotation", windowWidth/2, 5*windowHeight/6);
    stroke(255);
}

function draw(){

  if(xPos<windowWidth){


  stroke(255,0,0);
  line(xPos - 3, windowHeight/6-map(pAccelerationX,-40,40,-windowHeight/6,windowHeight/6), xPos,windowHeight/6-map(accelerationX,-40,40,-windowHeight/6,windowHeight/6))
  stroke(0,0,255);
  line(xPos - 3, 3*windowHeight/6-map(pAccelerationY,-40,40,-windowHeight/6,windowHeight/6), xPos,3*windowHeight/6-map(accelerationY,-40,40,-windowHeight/6,windowHeight/6))
  stroke(0,255,0);
  line(xPos - 3, 5*windowHeight/6-map(pRotationZ,-180,180,-windowHeight/6,windowHeight/6), xPos,5*windowHeight/6-map(rotationZ,-180,180,-windowHeight/6,windowHeight/6))


  // point(xPos,windowHeight/6-map(accelerationX,-40,40,-windowHeight/6,windowHeight/6));
  // point(xPos,3*windowHeight/6-map(accelerationY,-40,40,-windowHeight/6,windowHeight/6));
  // point(xPos,5*windowHeight/6-map(accelerationZ,-40,40,-windowHeight/6,windowHeight/6));

  xPos = xPos + 3;

}

}


/*

  //testing without map function gives same results

  stroke(255,0,0);
  point(xPos,windowHeight/6 - rotationX*(windowHeight/6)/180);
  stroke(0,255,0);
  point(xPos,3*windowHeight/6 - rotationY*(windowHeight/6)/180);
  stroke(0,0,255);
  point(xPos,windowHeight - (rotationZ)*(windowHeight/6)/180);

*/