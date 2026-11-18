export class StrokeSampler {

	constructor( x, y, pressure, spacing ) {

		Object.assign( this, { x, y, pressure, spacing, remainder: 0 } );

	}

	move( x, y, pressure, emit ) {

		const dx = x - this.x, dy = y - this.y, distance = Math.hypot( dx, dy );
		const spacing = Math.max( this.spacing, ( distance + this.remainder ) / 90 );
		let offset = spacing - this.remainder;
		const changed = distance > 0 && offset <= distance;
		for ( ; offset <= distance; offset += spacing ) {

			const fraction = offset / distance;
			emit( this.x + dx * fraction, this.y + dy * fraction, this.pressure + ( pressure - this.pressure ) * fraction );

		}
		this.remainder = spacing - offset + distance;
		Object.assign( this, { x, y, pressure } );
		return changed;

	}

}
