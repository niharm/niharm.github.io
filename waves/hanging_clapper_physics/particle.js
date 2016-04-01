// Based on Shiffman's Particle Class
// Custom Particle Class
function Particle(x,y) {
  this.theta = 0;
  this.acceleration = 0;
  this.velocity = 0;
  this.position = createVector(x,y);
  //this.maxspeed = Infinity;
  //this.maxForce = Infinity;
  this.resting = createVector(width/2,2*height/3);
  this.base = createVector(width/2,0); // where the clapper is attached
  this.r = 50;

  // Integrate acceleration
  this.update = function(additional_acceleration) {
    this.velocity += this.acceleration;
    this.acceleration += this.additional_acceleration;
    //this.velocity.limit(this.maxspeed); // Limit speed
    this.theta += this.velocity;

    if (abs(this.theta) < 0.02) {
      this.theta = 0;
      this.velocity = 0;
    }

    var theta_in_radians = this.theta * Math.PI / 180; // temp
    this.position.x = sin(theta_in_radians) * this.resting.y + this.resting.x;
    this.position.y = cos(theta_in_radians) * this.resting.y;

    console.log(theta_in_radians);
    console.log(this.theta);

    this.acceleration = 0;  // Reset acceleration to 0 each cycle
  }

  this.steer = function(k1,k2) {
    this.acceleration = -k1*(this.theta)-k2*this.velocity;
    //this.acceleration.limit(this.maxforce);  // Limit to maximum steering force
  }

  this.display = function() {
    stroke(255);
    strokeWeight(2);
    line(this.base.x,this.base.y,p.position.x,p.position.y);
    noStroke();
    fill(255);
    ellipse(this.position.x, this.position.y, this.r, this.r);
  }
}


