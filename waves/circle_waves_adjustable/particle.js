function Particle(x,y) {
  this.acceleration = createVector(0,0);
  this.velocity = createVector(0,0);
  this.position = createVector(x,y);
  //this.maxspeed = Infinity;
  //this.maxForce = Infinity;
  this.target = createVector(width/2,height/2);
  this.r = 25;

  // Integrate acceleration
  this.update = function(additional_acceleration) {
    this.velocity.add(this.acceleration);

    if (((this.position.x-this.target.x) < width/8) &&  ((this.position.y-this.target.y) < height/8)) {
      this.velocity.add(additional_acceleration);
      //this.velocity.limit(this.maxspeed); // Limit speed
    };

    this.position.add(this.velocity);
    this.acceleration.mult(0);  // Reset acceleration to 0 each cycle
  }

  this.steer = function(k1,k2) {
    this.acceleration.x = -k1*(this.position.x-this.target.x)-k2*this.velocity.x;
    this.acceleration.y = -k1*(this.position.y-this.target.y)-k2*this.velocity.y;
    //this.acceleration.limit(this.maxforce);  // Limit to maximum steering force
  }

  this.display = function() {
    stroke(255);
    strokeWeight(4);
    line(this.target.x,this.target.y,p.position.x,p.position.y);
    noStroke();
    fill(255);
    ellipse(this.position.x, this.position.y, this.r, this.r);
  }
}


