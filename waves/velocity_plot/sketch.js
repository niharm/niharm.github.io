var xPos = 0;
var pAccelerationX = 0;
var pVelocity = 0;
var Velocity = 0;
var pastAccelerations = [0,0,0];
var unadjustedVelocity = 0; 
var pUnadjustedVelocity = 0;

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
  text("X Velocity", windowWidth/2, 3*windowHeight/6);
  text("Adjusted V", windowWidth/2, 5*windowHeight/6);
  stroke(255);

}

function adjustVelocityStdDev(pastAccelerations, pVelocity) {

  // calculate variance (stddev ^ 2)
  var avgAccel = (pastAccelerations[0] + pastAccelerations[1] + pastAccelerations[2])/3;
  var stdDev = 0;
  for (var i = 0; i < 3; i++) {
    stdDev += (pastAccelerations[i] - avgAccel) * (pastAccelerations[i] - avgAccel);
    console.log(stdDev);
  }
  stdDev = stdDev/3;

  // return 0 if low std dev
  if (stdDev < 1) {
    return 0;
  }
  else {
    return pVelocity + pastAccelerations[2];
  }
}

function draw(){
  // add new acceleration (maintain length of array)
  pastAccelerations.splice(0, 1);
  pastAccelerations.push(accelerationX);

  // adjust velocity
  Velocity = adjustVelocityStdDev(pastAccelerations, Velocity, pVelocity);

  unadjustedVelocity += accelerationX;

  if(xPos<windowWidth){

    stroke(255,0,0);
    line(xPos - 3, windowHeight/6-map(pAccelerationX,-40,40,-windowHeight/6,windowHeight/6), xPos,windowHeight/6-map(accelerationX,-40,40,-windowHeight/6,windowHeight/6))
    stroke(0,0,255);
    line(xPos - 3, 3*windowHeight/6-map(pUnadjustedVelocity,-100,100,-windowHeight/6,windowHeight/6), xPos,3*windowHeight/6-map(unadjustedVelocity,-100,100,-windowHeight/6,windowHeight/6))
    stroke(0,255,0);
    line(xPos - 3, 5*windowHeight/6-map(pVelocity,-100,100,-windowHeight/6,windowHeight/6), xPos,5*windowHeight/6-map(Velocity,-100,100,-windowHeight/6,windowHeight/6))


    xPos = xPos + 3; 
    pVelocity = Velocity;
    pUnadjustedVelocity = unadjustedVelocity;
    pAccelerationX = accelerationX;

  } 
}
