// Based on Shiffman's Particle Class
// Custom Particle Class
function Particle(x,y) {
  this.theta = 0;
  this.acceleration = 0;
  this.velocity = 0;
  this.position = p5_bell.createVector(x,y);
  //this.maxspeed = Infinity;
  //this.maxForce = Infinity;
  this.resting = p5_bell.createVector(p5_bell.width/2,2*p5_bell.height/3); // where the ball hangs
  this.base = p5_bell.createVector(p5_bell.width/2,0); // where the clapper is attached
  this.r = 50;

  // Integrate acceleration
  this.update = function(additional_acceleration) {
    this.velocity += this.acceleration;
    this.acceleration += this.additional_acceleration;
    //this.velocity.limit(this.maxspeed); // Limit speed
    this.theta += this.velocity;

    // prevent useless small calculations
    if (Math.abs(this.theta) < 0.02) {
      this.theta = 0;
      this.velocity = 0;
    }

    // test for collision
    var collision_occurred = false;
    if (this.theta > p5_bell.MAX_ANGLE) {
      this.theta = p5_bell.MAX_ANGLE;
      collision_occurred = true;
    }
    if (this.theta < -1 * p5_bell.MAX_ANGLE) {
      this.theta = -1 * p5_bell.MAX_ANGLE;
      collision_occurred = true;
    }

    var theta_in_radians = this.theta * Math.PI / 180; // temp
    this.position.x = Math.sin(theta_in_radians) * this.resting.y + this.resting.x;
    this.position.y =  Math.cos(theta_in_radians) * this.resting.y;
    this.acceleration = 0;  // Reset acceleration to 0 each cycle

    // call collision if it happened
    if (collision_occurred) {
      collision(); }
  }

  this.steer = function(k1,k2) {
    this.acceleration = -k1*(this.theta)-k2*this.velocity;
    //this.acceleration.limit(this.maxforce);  // Limit to maximum steering force
  }

  this.display = function() {
    p5_bell.stroke(255);
    p5_bell.strokeWeight(2);
    p5_bell.line(this.base.x,this.base.y,this.position.x,this.position.y);
    p5_bell.noStroke();
    p5_bell.fill(255);
    p5_bell.ellipse(this.position.x, this.position.y, this.r, this.r);
  }
}


