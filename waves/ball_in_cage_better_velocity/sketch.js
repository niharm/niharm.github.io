// Spring tied to center of screen, making sound when it hits the walls.

var sensitivity = 40;
var bounciness = 0.4;
var damping = .02;
var stiffness = 0;
var accelerationThreshold = 0;

var decay = 10;
var bellPitches = [67.0, 67.0, 67.0, 67.0];
var numOsc = 2;
var bellOvertones = [1.0, 7.279, 9.405, 13.505];
var detune = .2;
var s = [];
var e = [];

var maxCircles = 40;

var circles = [];
var p, acceleration;

// to calculate adjusted velocity
var pVelocityX = 0;
var velocityX = 0;
var pVelocityY = 0;
var velocityY = 0;
var pastAccelerationsX = [0,0,0];
var pastAccelerationsY = [0,0,0];

var accChange;

function setup() {
  createCanvas(windowWidth,windowHeight);

  textSize(windowHeight/10);
  textAlign(CENTER, CENTER);
  fill(255);

  p = new Particle(width/2, height/2);
  acceleration = createVector(0, 0);

  initSound();
}

function draw() {

  background(50, 95);

  // left line
  stroke(237,34,93);
  strokeWeight(40);
  line(0,height,0,0);

  // top line
  stroke(237,34,93);
  strokeWeight(40);
  line(0,0,width,0);

  // right line
  stroke(237,34,93);
  strokeWeight(40);
  line(width,height,width,0);

  // bottom line
  stroke(237,34,93);
  strokeWeight(40);
  line(width,height,0,height);

  if (phoneShaked(accelerationThreshold)){

    // add new acceleration (maintain length of array)
    pastAccelerationsX.splice(0, 1);
    pastAccelerationsX.push(accelerationX);
    pastAccelerationsY.splice(0, 1);
    pastAccelerationsY.push(accelerationY);

    // adjust velocity
    velocityX = adjustVelocityStdDev(pastAccelerationsX, pVelocityX);
    velocityY = adjustVelocityStdDev(pastAccelerationsY, pVelocityY);
    pVelocityX = velocityX;
    pVelocityY = velocityY;

    if (velocityX > 0) {
        console.log('X' + velocityX);
    }

    if (velocityY > 0) {
        console.log('Y' + velocityY);
    }

    // // velocity control
    // if (abs(velocityX) > 0) {
    //   p.velocity.x += -1*sensitivity*velocityX; 
    // }
    // if (abs(velocityY) > 0) {
    //   p.velocity.y += sensitivity*velocityY; 
    // }


    // acceleration control
    acceleration.x = -1*sensitivity*velocityX/40; 
    acceleration.y = sensitivity*velocityY/40; 

    console.log('  ');
    console.log('accelerationX' + acceleration.x);
    console.log('accelerationY' + acceleration.y);
    console.log('velocityX' + p.velocity.x);
    console.log('velocityY' + p.velocity.y);
  }

  else {
    //for acceleration control, reset acceleration to 0
    acceleration.x = 0;
    acceleration.y = 0;
  }

  p.steer(stiffness, damping);
  p.update(acceleration);
  p.display();

  collision();
  drawCircles();

  if (mouseIsPressed){
    p.position.x = mouseX;
    p.position.y = mouseY;
    p.velocity.x = 0;
    p.velocity.y = 0;
  }

}

function adjustVelocityStdDev(pastAccelerations, pVelocity) {

  // calculate variance (stddev ^ 2)
  var avgAccel = (pastAccelerations[0] + pastAccelerations[1] + pastAccelerations[2])/3;
  var stdDev = 0;
  for (var i = 0; i < 3; i++) {
    stdDev += (pastAccelerations[i] - avgAccel) * (pastAccelerations[i] - avgAccel);
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

function collision(){

  if (p.position.x < 0)
  {
    makeSound(0, p.position, p.velocity);
    p.position.x = 0;
    p.velocity.x = -1*bounciness*p.velocity.x;
  }
  else if (p.position.y < 0)
  {
    makeSound(1, p.position, p.velocity);
    p.position.y = 0;
    p.velocity.y = -1*bounciness*p.velocity.y;
  }
  else if (p.position.x > width)
  {
    makeSound(2, p.position, p.velocity);
    p.position.x = width;
    p.velocity.x = -1*bounciness*p.velocity.x;
  }
  else if (p.position.y > height)
  {
    makeSound(3, p.position, p.velocity);
    p.position.y = height;
    p.velocity.y = -1*bounciness*p.velocity.y;
  }

}

function initSound(){

  for (j = 0; j < bellPitches.length; j++)
  {
    s[j] = [];
    e[j] = [];
    for (i = 0; i < numOsc; i++)
    {
      s[j][i] = new p5.SinOsc();
      s[j][i].amp(0);
      s[j][i].start();
      e[j][i] = new p5.Env(0.01, 0.5, 1, 0.5);
      e[j][i].setADSR(.01,2,0,0.1);
      e[j][i].setExp(true);
      s[j][i].freq(midiToFreq((bellPitches[j] + (random((detune*-1.0), detune)))) * bellOvertones[i]);
    }
  }

}

function makeSound(wall,position,velocity)
{
  circles.push([wall,position.x,position.y,0,0,0]);

  var currentVelTotal = (abs(velocity.x) + abs(velocity.y));

  for (i = 0; i < numOsc; i++)
  {
    e[wall][i].setADSR(0.01, random(.6, (decay / (i+1))), 0.0, 0.1);
    // note for later: the 600 below may need to be expressed in terms of windowWidth
    e[wall][i].setRange(random(0.01, (map(currentVelTotal, 0, 600, 0.01, 1.0) * .33)));
    //e[i].setRange((random(0.01, (1/(i+1)))) * .5);
    e[wall][i].play(s[wall][i], 0);
  }

}

function drawCircles(){

  for (var i = 0; i < circles.length; i++)
  {
    var thisCircle = circles[i];
    var circleSize = thisCircle[3];
    var circleWall = thisCircle[0];
    var circleColor;

    // calculate opacity based on number of circles so far
    var numCircles = thisCircle[4];
    var opacity = 1 - numCircles/maxCircles;
    
    // draws up to maxCircles circles
    if (numCircles < maxCircles)
    {
      strokeWeight(3);
      switch(circleWall){
        case 0:
          circleColor = 'rgba(237,34,93,' + opacity + ')';
          break;
        case 1:
          circleColor = 'rgba(237,34,93,' + opacity + ')';
          break;
        case 2:
          circleColor = 'rgba(237,34,93,' + opacity + ')';
          break;
        case 3:
          circleColor = 'rgba(237,34,93,' + opacity + ')';
          break;
      }
      stroke(circleColor);
      noFill();
      ellipse(thisCircle[1], thisCircle[2], circleSize, circleSize);
      circles[i][3] += (width / (maxCircles/2));
      ++circles[i][4];
    }
    else
    {
      circles.splice(i,1);
    }
  }

}

function phoneShaked(threshold) {
  // Calculate total change in accelerationX and accelerationY
  accChange = abs(accelerationX - pAccelerationX) + abs(accelerationY - pAccelerationY);
  // If shake
  if (accChange >= threshold) {return true;}
  // If not shake
  else {return false;}
}
