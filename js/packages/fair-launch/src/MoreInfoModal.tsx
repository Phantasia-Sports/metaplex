import {
    IconButton,
    Link,
} from '@material-ui/core';

import Typography from '@material-ui/core/Typography';
import Dialog from '@material-ui/core/Dialog';
import MuiDialogTitle from '@material-ui/core/DialogTitle';
import MuiDialogContent from '@material-ui/core/DialogContent';
import CloseIcon from '@material-ui/icons/Close';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

import { FairLaunchAccount } from './fair-launch';
import { CandyMachineAccount } from './candy-machine';
import { toDate } from './utils';

interface MoreInfoModalProps {
    open: boolean,
    onClose: any,
    PaperProps: {}
    setHowToOpen: any,
    candyMachinePredatesFairLaunch: any,
    fairLaunch: FairLaunchAccount | undefined,
    candyMachine: CandyMachineAccount | undefined
}

export const MoreInfoModal: React.FC<MoreInfoModalProps> = ({
    open,
    onClose,
    PaperProps,
    setHowToOpen,
    candyMachinePredatesFairLaunch,
    fairLaunch,
    candyMachine
}) => {

console.log(open)
    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={PaperProps}
        >
            <MuiDialogTitle
                disableTypography
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Link
                    component="button"
                    variant="h6"
                    color="textSecondary"
                    onClick={() => {
                        setHowToOpen(true);
                    }}
                >
                    How it works
                </Link>
                <IconButton
                    aria-label="close"
                    onClick={() => setHowToOpen(false)}
                >
                    <CloseIcon />
                </IconButton>
            </MuiDialogTitle>
            <MuiDialogContent>
                <Typography variant="h6">
                    Phase 1 - Set the fair price:
                </Typography>
                <Typography gutterBottom color="textSecondary">
                    Enter a bid in the range provided by the artist. The median of
                    all bids will be the "fair" price of the raffle ticket.{' '}
                    {fairLaunch?.state?.data?.fee && (
                        <span>
                            <b>
                                All bids will incur a ◎{' '}
                                {fairLaunch?.state?.data?.fee.toNumber() /
                                    LAMPORTS_PER_SOL}{' '}
                                fee.
                            </b>
                        </span>
                    )}
                </Typography>
                <Typography variant="h6">Phase 2 - Grace period:</Typography>
                <Typography gutterBottom color="textSecondary">
                    If your bid was at or above the fair price, you automatically
                    get a raffle ticket at that price. There's nothing else you
                    need to do. Your excess SOL will be returned to you when the
                    Fair Launch authority withdraws from the treasury. If your bid
                    is below the median price, you can still opt in at the fair
                    price during this phase.
                </Typography>
                {candyMachinePredatesFairLaunch ? (
                    <>
                        <Typography variant="h6">
                            Phase 3 - The Candy Machine:
                        </Typography>
                        <Typography gutterBottom color="textSecondary">
                            Everyone who got a raffle ticket at the fair price is
                            entered to win an NFT. If you win an NFT, congrats. If you
                            don’t, no worries, your SOL will go right back into your
                            wallet.
                        </Typography>
                    </>
                ) : (
                    <>
                        <Typography variant="h6">Phase 3 - The Lottery:</Typography>
                        <Typography gutterBottom color="textSecondary">
                            Everyone who got a raffle ticket at the fair price is
                            entered to win a Fair Launch Token that entitles them to
                            an NFT at a later date using a Candy Machine here. If you
                            don’t win, no worries, your SOL will go right back into
                            your wallet.
                        </Typography>
                        <Typography variant="h6">
                            Phase 4 - The Candy Machine:
                        </Typography>
                        <Typography gutterBottom color="textSecondary">
                            On{' '}
                            {candyMachine?.state.goLiveDate
                                ? toDate(
                                    candyMachine?.state.goLiveDate,
                                )?.toLocaleString()
                                : ' some later date'}
                            , you will be able to exchange your Fair Launch token for
                            an NFT using the Candy Machine at this site by pressing
                            the Mint Button.
                        </Typography>
                    </>
                )}
            </MuiDialogContent>
        </Dialog>)

}