# Getting started & Install

Install package and deps. Node, npm (and package/version managers) are a pre-requisite, be sure to have these installed. 
This project was created using `bun init` in bun v1.1.29. 

To install:

```
bun install
```

To run:
## run dev

```
bun run dev
```

## run production

```
bun run prod
```

# Preparing for production

## Clearing , linting, formatting 
Lint and apply safe fixes only to the src directory:

To clear the dist or prod directory, run `npm run clean`

# Scaffolding & Architecture

The src folder is intended to hold all app and project specific items. 
The root directory holds all the dot and config files, which can be edited and deleted as needed, if alternate processes are used. 
The root directory contains the build process file, which is dev.ts 
The prod.ts file builds from the dev.ts file (so it's not necessary to re-create a server to run a production build)


# Diagnostics

Served up through biome in this version. Saved useful commands and utilities here:

CLI help
```
biome --help
```
Help with Biome daemon logs
```
biome explain daemon-logs
```
Find all `console.log` invocations 
```
biome search '`console.log($message)`' 
