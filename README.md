# KnotzInvadeSpace

KnotzInvadeSpace is a fun and challenging 2D space-invaders style arcade game where the player has to destroy oncoming waves of alien beetlemorphs. Each wave of enemies is progressively harder to destroy, requiring skill and quick reflexes to navigate through the game. This project uses HTML5 Canvas for rendering and vanilla JavaScript for game logic.

## Table of contents
1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Usage](#usage)
4. [Contributing](#contributing)
5. [License](#license)

## Getting Started

1. Clone the repository to your local machine.
2. Open the `index.html` file in your favorite browser.

## Project Structure

The main components of the project are:

- **index.html**: Entry point of the application. Includes the canvas used for the game and references to game assets and JavaScript files.
- **styles.css**: Contains all the styles used in the game.
- **game.js**: Contains the main logic of the game, includes the classes for the Player, Projectiles, Enemies, and Waves.
- **beetlemorph.png**: The image file used for the alien beetlemorphs.
- **player.png** and **player_jets.png**: The image files used for the player and their jet.

## Usage

The game starts immediately on page load. The player can move left and right using the 'ArrowLeft' and 'ArrowRight' keys respectively. The player can shoot projectiles by pressing the space bar.

Scoring is based on the number of enemies destroyed. The game ends when the player runs out of lives or an enemy reaches the bottom of the screen. The player can press 'r' to restart the game.

## Contributing

Contributions are always welcome! Please read the [contribution guidelines](CONTRIBUTING.md) first.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
