// Spring tied to center of screen, making sound when it hits the walls.

var stiffness = 0.05;
var damping = 0.05;
var bounciness = 0.5;
var sensitivity = 10;
var min_acceleration_threshold = 10;

var decay = 10;
var bellPitches = [60.0, 63.0, 67.0, 72.0];
var numOsc = 2;
var bellOvertones = [1.0, 7.279, 9.405, 13.505];
var detune = .2;
var s = [];
var e = [];

var circles = [];
var p, acceleration;

var accChange;

function setup() {
  createCanvas(windowWidth,windowWidth);

  textSize(windowHeight/10);
  textAlign(CENTER, CENTER);
  fill(255);

  p = new Particle(width/2, height/2);
  acceleration = createVector(0, 0);

  initSound();
}

function draw() {

  background(51,50);

 // if(phoneShaked(min_acceleration_threshold)){

    // you can chose whether to control the position, velocity, or acceleration

    // velocity control
  //  p.velocity.x += rotationY;
  //  p.velocity.y += rotationX;

    // position control
    // p.position.x += accelerationX;
    // p.position.y += accelerationY;

    // acceleration control
     acceleration.x = rotationY;
     acceleration.y = rotationX;
//  }

  //else{
    // for acceleration control, reset acceleration to 0
  //  acceleration.x = 0;
  //  acceleration.y = 0;
//  }

  p.steer(stiffness, damping);
  p.update(acceleration);
  p.display();

  collision();
  drawCircles();

  if(mouseIsPressed){
    p.position.x = mouseX;
    p.position.y = mouseY;
    p.velocity.x = 0;
    p.velocity.y = 0;
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
  circles.push([wall,position.x,position.y,0]);

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
    if (circleSize < (sqrt(2) * width *2))
    {
      strokeWeight(5);
      switch(circleWall){
        case 0:
          circleColor = '#e9f679';
          break;
        case 1:
          circleColor = '#9bdf46';
          break;
        case 2:
          circleColor = '#25a55f';
          break;
        case 3:
          circleColor = '#346473';
          break;
      }
      stroke(circleColor);
      noFill();
      ellipse(thisCircle[1], thisCircle[2], circleSize, circleSize);
      circles[i][3] += (windowWidth / 10);
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
