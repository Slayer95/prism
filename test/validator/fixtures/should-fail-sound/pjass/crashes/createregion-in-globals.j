type region extends handle

native CreateRegion takes nothing returns region

globals
    region r = CreateRegion()
endglobals
