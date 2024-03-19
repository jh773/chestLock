import { world } from "@minecraft/server";

export function getScore(player, objective) {
    try {
        if(typeof player =='string'){
            const s = world.scoreboard.getObjective(objective).getScores().find(x=>{x.participant==player})
            if(s==undefined) return 0;
            return s.score;
        } else {
            if(world.scoreboard.getObjective(objective).getScore(player.scoreboardIdentity)==undefined){
                return 0;
            } else {
                return world.scoreboard.getObjective(objective).getScore(player.scoreboardIdentity);
            }
        }
    } catch (error) {
        return 0;
    }
}
