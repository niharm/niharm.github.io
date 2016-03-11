var xPos = 0;

function setup(){
  createCanvas(windowWidth, windowHeight);
  xPos = windowWidth+1;
  stroke(255);
  strokeWeight(6);
  fill(70);
  
  size = windowHeight/10;
  textSize(size);
  textAlign(CENTER,CENTER);
}

function draw(){

  if(xPos>windowWidth){
    background(0);
    xPos = 0;
    noStroke();
    text("X rotation", windowWidth/2, windowHeight/6);
    text("Y rotation", windowWidth/2, 3*windowHeight/6);
    text("Z rotation", windowWidth/2, 5*windowHeight/6);
    stroke(255);
  }

  stroke(255,0,0);
  point(xPos,windowHeight/6-map(rotationX,-180,180,-windowHeight/6,windowHeight/6));
  stroke(0,255,0);
  point(xPos,3*windowHeight/6-map(rotationY,-180,180,-windowHeight/6,windowHeight/6));
  stroke(0,0,255);
  point(xPos,5*windowHeight/6-map(rotationZ,0,360,-windowHeight/6,windowHeight/6));

  xPos++;


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