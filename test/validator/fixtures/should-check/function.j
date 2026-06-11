native placeholder takes nothing returns nothing

function Modulo takes integer dividend, integer divisor returns integer
    local integer modulus = dividend - (dividend / divisor) * divisor

    if (modulus < 0) then
        set modulus = divisor
    endif

    return modulus
endfunction

function InitBlizzard takes nothing returns nothing
endfunction

function config takes nothing returns nothing
endfunction

function main takes nothing returns nothing
	call Modulo(10, 3)
endfunction
