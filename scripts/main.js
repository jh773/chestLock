import { ItemStack, system, world } from "@minecraft/server";
import { database } from "./util/database";
import { ModalFormData } from "@minecraft/server-ui";
import { canPlaceHopper, canPlacePiston, canSpawnHopperCart } from "./setting";

const db = new database("chestLock");

function checkAndRemove(data){
    const locs = data[1].location;
    for(const i of locs){
        const block = world.getDimension(`overworld`).getBlock(i);
        if(block == undefined) continue;
        if(block.isAir == false) continue;
        if(locs.length == 1){
            db.delete(data[0])
        } else {
            data[1].location = locs.filter(a=> JSON.stringify(a) != JSON.stringify(i));
            db.set(data[0],data[1]);
        }
    }
}

system.runInterval(()=>{
    const list = db.entries();
    list.forEach(checkAndRemove);
})

world.beforeEvents.playerBreakBlock.subscribe(ev=>{
    const {block,player} = ev;
    if(block.typeId != "minecraft:chest") return;
    const data = loadDatabase(block);
    if(data == undefined) return;
    if((player.id == data[1]?.owner) == false){
        ev.cancel = true;
        return;
    };
})

const interactCooltime = new Map();
world.beforeEvents.playerInteractWithBlock.subscribe((ev)=>{
    const {block,player,itemStack} = ev;
    if(block.typeId != "minecraft:chest") return;
    const data = loadDatabase(block);
    if(data == undefined) return;
    if((player.id == data[1]?.owner) == false){
        ev.cancel = true;
        return;
    } else if(player.isSneaking == true && itemStack == undefined){
        ev.cancel = true;
        if(interactCooltime.has(player) == true && interactCooltime.get(player) > system.currentTick) return;
        system.run(()=>{chestMainUi(player,block)});
        interactCooltime.set(player,system.currentTick + 5)
        return;
    }
})

function chestMainUi(player,block){
    const form = new ModalFormData().title('상자');
    const data = loadDatabase(block);
    form.dropdown(`주인 : ${player.name}\n공유된 플레이어 : [${data[1].players.join(',')}]`,['추가','제거'],0).textField(``,'플레이어 이름');
    form.show(player).then(res=>{
        if(res.canceled == true) return;
        const text = res.formValues[1];
        if(!text) return; 
        if(res.formValues[0] == 0){
            if(data[1].players.includes(text) == false) data[1].players.push(text);
        } else if(res.formValues[0] == 1){
            if(data[1].players.includes(text) == true) data[1].players = data[1].players.filter(x=> x != text);
        }
        db.set(data[0],data[1]);
    })
}

world.beforeEvents.itemUseOn.subscribe(ev=>{
    if(ev.itemStack.typeId == "minecraft:hopper_minecart" && canSpawnHopperCart == false){
        ev.cancel = true;
        return;
    }
})

world.beforeEvents.playerPlaceBlock.subscribe(ev=>{
    const {block,player,permutationBeingPlaced} = ev;
    if(permutationBeingPlaced.type.id == "minecraft:hopper" && canPlaceHopper == false){
        ev.cancel = true;
        return;
    } else if(permutationBeingPlaced.type.id.includes('piston') && canPlacePiston == false){
        ev.cancel = true;
        return;
    }

    if(permutationBeingPlaced.type.id != "minecraft:chest") return;
    const chestChest = checkOtherChest(player,block);
    if(chestChest == false) {
        player.sendMessage(`다른 플레이어의 상자와 너무 가깝습니다`)
        ev.cancel = true;
        return;
    }
})

world.afterEvents.playerPlaceBlock.subscribe(ev=>{
    const { block,player } = ev;
    if(block.typeId != "minecraft:chest") return;
    const blockInv = block.getComponent(`inventory`)?.container;
    const t = new Date().getTime();
    if(blockInv.size == 27){
        db.set(t,{
            owner : player.id,
            name : player.name,
            location : [
                block.location
            ],
            players : []
        });
    } else if(blockInv.size == 54){
        const block1 = findLargeChestBlock(block);
        const checkData = loadDatabase(block1);
        if(checkData == undefined){
            db.set(t,{
                owner : player.id,
                name : player.name,
                location : [
                    block.location,
                    block1.location
                ],
                players : []
            });
        } else {
            checkData[1].location.push(block.location);
            db.set(checkData[0],checkData[1]);
        }
    }
})

function loadDatabase(block){
    const data = db.entries().find(x=>{
        if(x[1].location.map(x=>JSON.stringify(x)).includes(JSON.stringify(block.location))) return true;
    });
    return data;
}

function findLargeChestBlock(block){
    const permutation = block.permutation;
    const direction = permutation.getState(`minecraft:cardinal_direction`);
    let block1,block2;
    if(direction == "west" || direction == "east"){
        block1 = block.south();
        block2 = block.north();
    } else {
        block1 = block.east();
        block2 = block.west();
    }
    const blockInv = block.getComponent(`inventory`)?.container;
    const block1Inv = block1.getComponent(`inventory`)?.container;
    const block2Inv = block2.getComponent(`inventory`)?.container;
    const originItemStack = blockInv.getItem(0);
    const time = new Date().getTime();
    const compareItem = new ItemStack(`minecraft:barrier`,1);
    let returnBlock;
    compareItem.nameTag = `${time}`;
    blockInv.setItem(0,compareItem);
    if(block1Inv != undefined && block1Inv.getItem(0)?.nameTag == String(time)){
        returnBlock = block1;
    } else if(block2Inv != undefined && block2Inv.getItem(0)?.nameTag == String(time)){
        returnBlock = block2;
    }
    blockInv.setItem(0,originItemStack);
    return returnBlock;
}

function checkOtherChest(player,block){
    for(const data of db.entries()){
        for(const location of data[1].location){
            if(Math.abs(location.x - block.location.x) > 1) continue;
            if(Math.abs(location.z - block.location.z) > 1) continue;
            if(location.y != block.location.y) continue;
            if(data[1].owner != player.id) return false;
        }
    }
    return true;
}