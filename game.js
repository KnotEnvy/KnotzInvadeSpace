class Player {
    constructor(game){
        this.game = game;
        this.width = 100;
        this.height = 100
        this.x = this.game.width * 0.5 - this.width * 0.5
        this.y = this.game.height - this.height
        this.speed = 15

    }
    draw(c) {
        c.fillRect(this.x, this.y, this.width, this.height)
    }
    update(){
        //horizxontal
        if (this.game.keys.indexOf('ArrowLeft') > -1) this.x -= this.speed;
        if (this.game.keys.indexOf('ArrowRight') > -1) this.x += this.speed;
        //horizxontal boundaries
        if (this.x < -this.width* 0.5) this.x = -this.width*0.5;
        else  if(this.x > this.game.width -this.width*0.5) this.x = this.game.width - this.width*.5;

    }
    shoot(){
        const projectile = this.game.getProjectile();
        if (projectile) projectile.start(this.x + this.width*0.5, this.y);
    }
}
class Projectile {
    constructor(){
        this.width = 4;
        this.height = 20;
        this.x = 0
        this.y = 0
        this.speed = 20;
        this.free = true;
    }
    draw(c){
        if (!this.free){
            c.fillRect(this.x, this.y, this.width, this.height)
        }
    }
    update(){
        if (!this.free){
            this.y -= this.speed;
            if(this.y < -this.height) this.reset()
        }
    }
    start(x, y){
        this.x = x- this.width *0.5;
        this.y = y;
        this.free= false;
    }
    reset(){
        this.free= true;

    }
}
class Enemy {
    constructor(game, positionX, positionY){
        this.game = game;
        this.width = this.game.enemySize
        this.height = this.game.enemySize
        this.x = 0
        this.y = 0;
        this.positionX = positionX
        this.positionY = positionY
        this.markedForDeletion = false;
    }
    draw(c){
        c.strokeRect(this.x, this.y, this.width, this.height)

    }
    update(x, y){
        this.x = x + this.positionX;
        this.y = y + this.positionY
        //check collisions
        this.game.projectilesPool.forEach(projectile => {
           if (!projectile.free && this.game.checkCollision(this, projectile)){
            this.markedForDeletion = true;
            projectile.reset()
           }
        });

    }
}
class Wave {
    constructor(game, ){
        this.game =game
        this.width = this.game.columns * this.game.enemySize
        this.height = this.game.rows * this.game.enemySize
        this.x = 0
        this.y = -this.height
        this.speedX = 3;
        this.speedY = 0;
        this.enemies = []
        this.create()
    }
    render(c){
        if (this.y < 0) this.y += 5
        this.speedY = 0;
        if (this.x < 0 || this.x > this.game.width - this.width){
            this.speedX *= -1;
            this.speedY = this.game.enemySize
        }
        this.x += this.speedX;
        this.y += this.speedY;
        this.enemies.forEach(enemy => {
            enemy.update(this.x, this.y)
            enemy.draw(c);
        })
        this.enemies = this.enemies.filter(object => !object.markedForDeletion);
    }
    create(){
        //create grid of enemies
        for (let y = 0; y < this.game.rows; y++){
            for(let x = 0; x <this.game.columns; x++){
                let enemyX = x * this.game.enemySize;
                let enemyY = y * this.game.enemySize
                this.enemies.push(new Enemy(this.game, enemyX, enemyY))
            }
        }

    }
    
}


class Game {
    constructor(canvas){
        this.canvas = canvas
        this.width = this.canvas.width
        this.height = this.canvas.height
        this.keys = [];
        this.player = new Player(this)

        this.projectilesPool = []
        this.numberOfProjectiles = 10;
        this.createProjectiles();

        // size of wave container
        this.columns = 5;
        this.rows = 7;
        this.enemySize = 60;

        this.waves = []
        this.waves.push(new Wave(this));
        
        this.score = 0

        //event listeners
        window.addEventListener('keydown', e => {
            if (this.keys.indexOf(e.key) === -1) this.keys.push(e.key)
            if(e.key === '1') this.player.shoot();


        });
        window.addEventListener('keyup', e => {
            const index = this.keys.indexOf(e.key)
            if (index > -1) this.keys.splice(index, 1);
            

        });
    }
    render(c) {
        this.drawStatusText(c)
        this.player.draw(c)
        this.player.update();
        this.projectilesPool.forEach(projectile => {
            projectile.update();
            projectile.draw(c)
        })
        this.waves.forEach(wave => {
            wave.render(c)
        })
    }
    //create projectiles object pool
    createProjectiles(){
        for (let i = 0; i < this.numberOfProjectiles; i++){
            this.projectilesPool.push(new Projectile());
        }
    }
    getProjectile(){
        for (let i = 0; i < this.projectilesPool.length; i++){
            if (this.projectilesPool[i].free) return this.projectilesPool[i];
        }
    }
    //collisions detection between 2 rects
    checkCollision(a, b){
        return (
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y 
        ) 
    }
    drawStatusText(c){
        c.fillText('Score: '+ this.game.score, 20 ,40)
    }
}

window.addEventListener('load', function(){
    const canvas = this.document.getElementById('canvas1')
    const ctx = canvas.getContext('2d');
    canvas.width = 600;
    canvas.height = 800;
    ctx.fillStyle = 'white'
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 5;
    ctx.font = '30px Impact'
    

    const game = new Game(canvas);

    function animate() {
        ctx.clearRect(0,0, canvas.width, canvas.height)
        game.render(ctx);
        requestAnimationFrame(animate);
    }
    animate();

})
