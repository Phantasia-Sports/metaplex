import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import './styles/styles.css';
import {
  CircularProgress,
  Container,
  Link,
  Slider,
  Snackbar,
} from '@material-ui/core';
import Button from '@material-ui/core/Button';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import { createStyles, Theme } from '@material-ui/core/styles';
import { PhaseCountdown } from './countdown';
import Dialog from '@material-ui/core/Dialog';
import MuiDialogContent from '@material-ui/core/DialogContent';
import phantasia_logo from './assets/phantasia.svg';
import Alert from '@material-ui/lab/Alert';

import * as anchor from '@project-serum/anchor';

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletDialogButton } from '@solana/wallet-adapter-material-ui';

import {
  awaitTransactionSignatureConfirmation,
  CandyMachineAccount,
  getCandyMachineState,
  mintOneToken,
} from './candy-machine';

import {
  FairLaunchAccount,
  getFairLaunchState,
  punchTicket,
  purchaseTicket,
  receiveRefund,
} from './fair-launch';

import { formatNumber, getAtaForMint, toDate } from './utils';
import Countdown from 'react-countdown';
import { MoreInfoModal } from './MoreInfoModal';

const ConnectButton = styled(WalletDialogButton)`
  width: 100%;
  height: 60px;
  margin-top: 10px;
  margin-bottom: 5px;
  background: linear-gradient(180deg, #604ae5 0%, #813eee 100%);
  color: white;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
`;

const MintContainer = styled.div``; // add your styles here

const MintButton = styled(Button)`
  width: 100%;
  height: 44px;
  margin-top: 0px;
  margin-bottom: 12px;
  background: linear-gradient(180deg, #604ae5 0%, #813eee 100%);
  color: white;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
`; // add your styles here

const dialogStyles: any = (theme: Theme) =>
  createStyles({
    root: {
      margin: 0,
      padding: theme.spacing(2),
    },
    closeButton: {
      position: 'absolute',
      right: theme.spacing(1),
      top: theme.spacing(1),
      color: theme.palette.grey[500],
    },
  });

const ValueSlider = styled(Slider)({
  color: '#5d5e60',
  height: 4,
  '& > *': {
    height: 2,
  },
  '& .MuiSlider-track': {
    border: 'none',
    height: 2,
  },
  '& .MuiSlider-thumb': {
    height: 24,
    width: 24,
    marginTop: -12,
    background: '#9662ff',
    border: '4px solid #131416',
    '&:focus, &:hover, &.Mui-active, &.Mui-focusVisible': {
      boxShadow: 'inherit',
    },
    '&:before': {
      display: 'none',
    },
  },
  '& .MuiSlider-valueLabel': {
    '& > *': {
      background: '#9662ff',
    },
    lineHeight: 1.2,
    fontSize: 12,
    padding: 0,
    width: 32,
    height: 32,
    marginLeft: 4,
  },
});

enum Phase {
  Phase0,
  Phase1,
  Phase2,
  Lottery,
  Phase3,
  Phase4,
  Unknown,
}

const Header = (props: {
  phaseName: string;
  desc: string;
  date: anchor.BN | undefined;
  status?: string;
}) => {
  const { phaseName, desc, date, status } = props;
  return (
    <div className="flex-row mb-md">
      <div className="flex-col">
        <span className="white weight-500 font-lg">
          Fair Launch Protocol {phaseName}
        </span>
        <span className="gray weight-500 font-lg">{desc}</span>
      </div>
      <div className="flex-grow"></div>
      <PhaseCountdown
        date={toDate(date)}
        style={{ justifyContent: 'flex-end' }}
        status={status || 'COMPLETE'}
      />
    </div>
  );
};

function getPhase(
  fairLaunch: FairLaunchAccount | undefined,
  candyMachine: CandyMachineAccount | undefined,
): Phase {
  // return Phase.Phase1;
  const curr = new Date().getTime();

  const phaseOne = toDate(fairLaunch?.state.data.phaseOneStart)?.getTime();
  const phaseOneEnd = toDate(fairLaunch?.state.data.phaseOneEnd)?.getTime();
  const phaseTwoEnd = toDate(fairLaunch?.state.data.phaseTwoEnd)?.getTime();
  const candyMachineGoLive = toDate(candyMachine?.state.goLiveDate)?.getTime();

  console.log('Phase 1', phaseOne);
  console.log('phase 1 end', phaseOneEnd);
  console.log('phase 2 end', phaseTwoEnd);
  console.log('Candy machine go live', candyMachineGoLive);
  console.log('Fair launch data', fairLaunch?.state.data);
  console.log(curr);

  if (phaseOne && curr < phaseOne) {
    return Phase.Phase0;
  } else if (phaseOneEnd && curr <= phaseOneEnd) {
    return Phase.Phase1;
  } else if (phaseTwoEnd && curr <= phaseTwoEnd) {
    return Phase.Phase2;
  } else if (!fairLaunch?.state.phaseThreeStarted) {
    return Phase.Lottery;
  } else if (
    fairLaunch?.state.phaseThreeStarted &&
    candyMachineGoLive &&
    curr > candyMachineGoLive
  ) {
    return Phase.Phase4;
  } else if (fairLaunch?.state.phaseThreeStarted) {
    return Phase.Phase3;
  }

  return Phase.Unknown;
}

export interface HomeProps {
  candyMachineId?: anchor.web3.PublicKey;
  fairLaunchId: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  startDate: number;
  txTimeout: number;
}

const FAIR_LAUNCH_LOTTERY_SIZE =
  8 + // discriminator
  32 + // fair launch
  1 + // bump
  8; // size of bitmask ones

const isWinner = (
  fairLaunch: FairLaunchAccount | undefined,
  fairLaunchBalance: number,
): boolean => {
  if (fairLaunchBalance > 0) return true;
  if (
    !fairLaunch?.lottery.data ||
    !fairLaunch?.lottery.data.length ||
    !fairLaunch?.ticket.data?.seq ||
    !fairLaunch?.state.phaseThreeStarted
  ) {
    return false;
  }

  const myByte =
    fairLaunch.lottery.data[
      FAIR_LAUNCH_LOTTERY_SIZE +
        Math.floor(fairLaunch.ticket.data?.seq.toNumber() / 8)
    ];

  const positionFromRight = 7 - (fairLaunch.ticket.data?.seq.toNumber() % 8);
  const mask = Math.pow(2, positionFromRight);
  const isWinner = myByte & mask;
  return isWinner > 0;
};

const Home = (props: HomeProps) => {
  const [fairLaunchBalance, setFairLaunchBalance] = useState<number>(0);
  const [yourSOLBalance, setYourSOLBalance] = useState<number | null>(null);

  const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT
  const [contributed, setContributed] = useState(0);

  const wallet = useWallet();

  const anchorWallet = useMemo(() => {
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet]);

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: '',
    severity: undefined,
  });

  const [fairLaunch, setFairLaunch] = useState<FairLaunchAccount>();
  const [candyMachine, setCandyMachine] = useState<CandyMachineAccount>();
  const [howToOpen, setHowToOpen] = useState(false);
  const [refundExplainerOpen, setRefundExplainerOpen] = useState(false);
  const [antiRugPolicyOpen, setAnitRugPolicyOpen] = useState(false);

  const onMint = async () => {
    try {
      setIsMinting(true);
      if (wallet.connected && candyMachine?.program && wallet.publicKey) {
        if (
          fairLaunch?.ticket.data?.state.unpunched &&
          isWinner(fairLaunch, fairLaunchBalance)
        ) {
          await onPunchTicket();
        }

        const mintTxId = await mintOneToken(candyMachine, wallet.publicKey);

        const status = await awaitTransactionSignatureConfirmation(
          mintTxId,
          props.txTimeout,
          props.connection,
          'singleGossip',
          false,
        );

        if (!status?.err) {
          setAlertState({
            open: true,
            message: 'Congratulations! Mint succeeded!',
            severity: 'success',
          });
        } else {
          setAlertState({
            open: true,
            message: 'Mint failed! Please try again!',
            severity: 'error',
          });
        }
      }
    } catch (error: any) {
      // TODO: blech:
      let message = error.msg || 'Minting failed! Please try again!';
      if (!error.msg) {
        if (!error.message) {
          message = 'Transaction Timeout! Please try again.';
        } else if (error.message.indexOf('0x138')) {
        } else if (error.message.indexOf('0x137')) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf('0x135')) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
          window.location.reload();
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: 'error',
      });
    } finally {
      setIsMinting(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (!anchorWallet) {
        return;
      }

      try {
        const balance = await props.connection.getBalance(
          anchorWallet.publicKey,
        );
        setYourSOLBalance(balance);

        const state = await getFairLaunchState(
          anchorWallet,
          props.fairLaunchId,
          props.connection,
        );

        setFairLaunch(state);

        try {
          if (state.state.tokenMint) {
            const fairLaunchBalance =
              await props.connection.getTokenAccountBalance(
                (
                  await getAtaForMint(
                    state.state.tokenMint,
                    anchorWallet.publicKey,
                  )
                )[0],
              );

            if (fairLaunchBalance.value) {
              setFairLaunchBalance(fairLaunchBalance.value.uiAmount || 0);
            }
          }
        } catch (e) {
          console.log('Problem getting fair launch token balance');
          console.log(e);
        }
        setContributed(
          (
            state.state.currentMedian || state.state.data.priceRangeStart
          ).toNumber() / LAMPORTS_PER_SOL,
        );
      } catch (e) {
        console.log('Problem getting fair launch state');
        console.log(e);
      }
      if (props.candyMachineId) {
        try {
          const cndy = await getCandyMachineState(
            anchorWallet,
            props.candyMachineId,
            props.connection,
          );
          setCandyMachine(cndy);
        } catch (e) {
          console.log('Problem getting candy machine state');
          console.log(e);
        }
      } else {
        console.log('No candy machine detected in configuration.');
      }
    })();
  }, [
    anchorWallet,
    props.candyMachineId,
    props.connection,
    props.fairLaunchId,
  ]);

  const min = formatNumber.asNumber(fairLaunch?.state.data.priceRangeStart);
  const max = formatNumber.asNumber(fairLaunch?.state.data.priceRangeEnd);
  const step = formatNumber.asNumber(fairLaunch?.state.data.tickSize);
  const median = formatNumber.asNumber(fairLaunch?.state.currentMedian);
  const marks = [
    {
      value: min || 0,
      label: `${min} SOL`,
    },
    {
      value: median || 0,
      label: `${median}`,
    },
    {
      value: max || 0,
      label: `${max} SOL`,
    },
  ].filter(_ => _ !== undefined && _.value !== 0) as any;

  const onDeposit = async () => {
    if (!anchorWallet) {
      return;
    }

    console.log('deposit');
    setIsMinting(true);
    try {
      await purchaseTicket(contributed, anchorWallet, fairLaunch);
      setIsMinting(false);
      setAlertState({
        open: true,
        message: `Congratulations! Bid ${
          fairLaunch?.ticket.data ? 'updated' : 'inserted'
        }!`,
        severity: 'success',
      });
    } catch (e) {
      console.log(e);
      setIsMinting(false);
      setAlertState({
        open: true,
        message: 'Something went wrong.',
        severity: 'error',
      });
    }
  };
  const onRugRefund = async () => {
    if (!anchorWallet) {
      return;
    }

    console.log('refund');
    try {
      setIsMinting(true);
      await receiveRefund(anchorWallet, fairLaunch);
      setIsMinting(false);
      setAlertState({
        open: true,
        message:
          'Congratulations! You have received a refund. This is an irreversible action.',
        severity: 'success',
      });
    } catch (e) {
      console.log(e);
      setIsMinting(false);
      setAlertState({
        open: true,
        message: 'Something went wrong.',
        severity: 'error',
      });
    }
  };
  const onRefundTicket = async () => {
    if (!anchorWallet) {
      return;
    }

    console.log('refund');
    try {
      setIsMinting(true);
      await purchaseTicket(0, anchorWallet, fairLaunch);
      setIsMinting(false);
      setAlertState({
        open: true,
        message:
          'Congratulations! Funds withdrawn. This is an irreversible action.',
        severity: 'success',
      });
    } catch (e) {
      console.log(e);
      setIsMinting(false);
      setAlertState({
        open: true,
        message: 'Something went wrong.',
        severity: 'error',
      });
    }
  };

  const onPunchTicket = async () => {
    if (!anchorWallet || !fairLaunch || !fairLaunch.ticket) {
      return;
    }

    console.log('punch');
    setIsMinting(true);
    try {
      await punchTicket(anchorWallet, fairLaunch);
      setIsMinting(false);
      setAlertState({
        open: true,
        message: 'Congratulations! Ticket punched!',
        severity: 'success',
      });
    } catch (e) {
      console.log(e);
      setIsMinting(false);
      setAlertState({
        open: true,
        message: 'Something went wrong.',
        severity: 'error',
      });
    }
  };

  const phase = getPhase(fairLaunch, candyMachine);

  const candyMachinePredatesFairLaunch =
    candyMachine?.state.goLiveDate &&
    fairLaunch?.state.data.phaseTwoEnd &&
    candyMachine?.state.goLiveDate.lt(fairLaunch?.state.data.phaseTwoEnd);

  const notEnoughSOL = !!(
    yourSOLBalance != null &&
    fairLaunch?.state.data.priceRangeStart &&
    fairLaunch?.state.data.fee &&
    yourSOLBalance + (fairLaunch?.ticket?.data?.amount.toNumber() || 0) <
      contributed * LAMPORTS_PER_SOL +
        fairLaunch?.state.data.fee.toNumber() +
        0.01
  );

  /*************************************************************************
   * ***********************************************************************
   * ***********************************************************************
   * ***********************************************************************
   * ***********************************************************************
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * HTML
   * ***********************************************************************
   * ***********************************************************************
   * ***********************************************************************
   * ***********************************************************************
   ************************************************************************/
  return (
    <div className="container-view relative blob-bg">
      <div className="bg-blurred-overlay"></div>
      <div className="stripe-svg stripe-pattern-container"></div>
      <Grid container className="h-full w-full">
        <Grid item xs={6} className="test-border">
          <div className="h-full w-full flex justify-center relative flex-col test-border relative ">
            <div className="modal-buttons">
              <div
                onClick={() => {
                  setHowToOpen(true);
                }}
              >
                How does this work?
              </div>
              <div
                onClick={() => {
                  setAnitRugPolicyOpen(true);
                }}
              >
                Anti-Rug Policy
              </div>
            </div>
            <div className="p-xl flex-col h-full mt-lg">
              <span className="font-lg gray weight-300">Season 1</span>
              <h2 className="m-0 white">Introducing...</h2>
              <h1 className=" white mb-md">
                The <span className="gradient-text">Phanatics</span>
              </h1>

              <span className="font-lg weight-300 gray">
                A beautifully designed set of 8888 unique generative art pieces.
                Mint a Phantasia NFT to gain early access to exclusive platform
                features, and be prioritized in future NFT drops.
              </span>
              <br></br>
              <br></br>
              <div className="flex-grow"></div>
              {phase === Phase.Phase0 && (
                <Header
                  phaseName={'Phase 0'}
                  desc={'Anticipation Phase'}
                  date={fairLaunch?.state.data.phaseOneStart}
                />
              )}
              {phase === Phase.Phase1 && (
                <Header
                  phaseName={'Phase 1'}
                  desc={'Set price phase'}
                  date={fairLaunch?.state.data.phaseOneEnd}
                />
              )}

              {phase === Phase.Phase2 && (
                <Header
                  phaseName={'Phase 2'}
                  desc={'Grace period'}
                  date={fairLaunch?.state.data.phaseTwoEnd}
                />
              )}

              {phase === Phase.Lottery && (
                <Header
                  phaseName={'Phase 3'}
                  desc={'Raffle in progress'}
                  date={fairLaunch?.state.data.phaseTwoEnd.add(
                    fairLaunch?.state.data.lotteryDuration,
                  )}
                />
              )}
              {phase === Phase.Phase3 && !candyMachine && (
                <Header
                  phaseName={'Phase 3'}
                  desc={'Raffle finished!'}
                  date={fairLaunch?.state.data.phaseTwoEnd}
                />
              )}

              {phase === Phase.Phase3 && candyMachine && (
                <Header
                  phaseName={'Phase 3'}
                  desc={'Minting starts in...'}
                  date={candyMachine?.state.goLiveDate}
                />
              )}

              {phase === Phase.Phase4 && (
                <Header
                  phaseName={
                    candyMachinePredatesFairLaunch ? 'Phase 3' : 'Phase 4'
                  }
                  desc={'Candy Time 🍬 🍬 🍬'}
                  date={candyMachine?.state.goLiveDate}
                  status="LIVE"
                />
              )}

              {fairLaunch && (
                <div className="information-box mb-sm">
                  {fairLaunch.ticket.data ? (
                    <>
                      <span className="font-lg white">Your Bid</span>
                      <span className="font-lg white weight-700">
                        {formatNumber.format(
                          (fairLaunch?.ticket.data?.amount.toNumber() || 0) /
                            LAMPORTS_PER_SOL,
                        )}{' '}
                        SOL
                      </span>
                    </>
                  ) : [Phase.Phase0, Phase.Phase1].includes(phase) ? (
                    <div className="">
                      {fairLaunch?.state?.data?.fee && (
                        <span className="font-lg weight-400 gray">
                          All initial bids will incur a ◎{' '}
                          {fairLaunch?.state?.data?.fee.toNumber() /
                            LAMPORTS_PER_SOL}{' '}
                          fee.
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="font-lg weight-400 gray">
                      You didn't participate in this raffle.
                    </span>
                  )}
                </div>
              )}

              {fairLaunch && (
                <>
                  {[
                    Phase.Phase1,
                    Phase.Phase2,
                    Phase.Phase3,
                    Phase.Lottery,
                  ].includes(phase) &&
                    fairLaunch?.ticket?.data?.state.withdrawn && (
                      <div style={{ paddingTop: '15px' }}>
                        <Alert severity="error">
                          Your bid was withdrawn and cannot be adjusted or
                          re-inserted.
                        </Alert>
                      </div>
                    )}
                  {[Phase.Phase1, Phase.Phase2].includes(phase) &&
                    fairLaunch.state.currentMedian &&
                    fairLaunch?.ticket?.data?.amount &&
                    !fairLaunch?.ticket?.data?.state.withdrawn &&
                    fairLaunch.state.currentMedian.gt(
                      fairLaunch?.ticket?.data?.amount,
                    ) && (
                      <div style={{ paddingTop: '15px' }}>
                        <Alert severity="warning">
                          Your bid is currently below the median and will not be
                          eligible for the raffle.
                        </Alert>
                      </div>
                    )}
                  {[Phase.Phase3, Phase.Lottery].includes(phase) &&
                    fairLaunch.state.currentMedian &&
                    fairLaunch?.ticket?.data?.amount &&
                    !fairLaunch?.ticket?.data?.state.withdrawn &&
                    fairLaunch.state.currentMedian.gt(
                      fairLaunch?.ticket?.data?.amount,
                    ) && (
                      <div style={{ paddingTop: '15px' }}>
                        <Alert severity="error">
                          Your bid was below the median and was not included in
                          the raffle. You may click <em>Withdraw</em> when the
                          raffle ends or you will be automatically issued one
                          when the Fair Launch authority withdraws from the
                          treasury.
                        </Alert>
                      </div>
                    )}
                  {notEnoughSOL && (
                    <Alert severity="error">
                      You do not have enough SOL in your account to place this
                      bid.
                    </Alert>
                  )}
                </>
              )}

              {[Phase.Phase1, Phase.Phase2].includes(phase) && (
                <>
                  <Grid style={{ marginTop: 6, marginBottom: 0 }}>
                    <ValueSlider
                      min={min}
                      marks={marks}
                      max={max}
                      step={step}
                      value={contributed}
                      onChange={(ev, val) => setContributed(val as any)}
                      valueLabelDisplay="auto"
                      style={{
                        width: 'calc(100% - 40px)',
                        marginLeft: 20,
                      }}
                    />
                  </Grid>
                </>
              )}

              {!wallet.connected ? (
                <ConnectButton>
                  Connect{' '}
                  {[Phase.Phase1].includes(phase) ? 'to bid' : 'to see status'}
                </ConnectButton>
              ) : (
                <div>
                  {[Phase.Phase1, Phase.Phase2].includes(phase) && (
                    <>
                      <MintButton
                        onClick={onDeposit}
                        variant="contained"
                        disabled={
                          isMinting ||
                          (!fairLaunch?.ticket.data &&
                            phase === Phase.Phase2) ||
                          notEnoughSOL
                        }
                      >
                        {isMinting ? (
                          <CircularProgress />
                        ) : !fairLaunch?.ticket.data ? (
                          'Place bid'
                        ) : (
                          'Change bid'
                        )}
                        {}
                      </MintButton>
                    </>
                  )}

                  {[Phase.Phase3].includes(phase) && (
                    <>
                      {isWinner(fairLaunch, fairLaunchBalance) && (
                        <MintButton
                          onClick={onPunchTicket}
                          variant="contained"
                          disabled={
                            fairLaunch?.ticket.data?.state.punched !== undefined
                          }
                        >
                          {isMinting ? <CircularProgress /> : 'Punch Ticket'}
                        </MintButton>
                      )}

                      {!isWinner(fairLaunch, fairLaunchBalance) && (
                        <MintButton
                          onClick={onRefundTicket}
                          variant="contained"
                          disabled={
                            isMinting ||
                            fairLaunch?.ticket.data === undefined ||
                            fairLaunch?.ticket.data?.state.withdrawn !==
                              undefined
                          }
                        >
                          {isMinting ? <CircularProgress /> : 'Withdraw'}
                        </MintButton>
                      )}
                    </>
                  )}

                  {phase === Phase.Phase4 && (
                    <>
                      {(!fairLaunch ||
                        isWinner(fairLaunch, fairLaunchBalance)) && (
                        <MintContainer>
                          <MintButton
                            disabled={
                              candyMachine?.state.isSoldOut ||
                              isMinting ||
                              !candyMachine?.state.isActive ||
                              (fairLaunch?.ticket?.data?.state.punched &&
                                fairLaunchBalance === 0)
                            }
                            onClick={onMint}
                            variant="contained"
                          >
                            {fairLaunch?.ticket?.data?.state.punched &&
                            fairLaunchBalance === 0 ? (
                              'MINTED'
                            ) : candyMachine?.state.isSoldOut ? (
                              'SOLD OUT'
                            ) : isMinting ? (
                              <CircularProgress />
                            ) : (
                              'MINT'
                            )}
                          </MintButton>
                        </MintContainer>
                      )}

                      {!isWinner(fairLaunch, fairLaunchBalance) && (
                        <MintButton
                          onClick={onRefundTicket}
                          variant="contained"
                          disabled={
                            isMinting ||
                            fairLaunch?.ticket.data === undefined ||
                            fairLaunch?.ticket.data?.state.withdrawn !==
                              undefined
                          }
                        >
                          {isMinting ? <CircularProgress /> : 'Withdraw'}
                        </MintButton>
                      )}
                    </>
                  )}
                </div>
              )}

              {fairLaunch && (
                <div className="flex-row justify-space w-full">
                  <div className="flex-col">
                    <span className="font-lg weight-400 gray">Bids</span>
                    <span className="font-lg weight-600 white">
                      {fairLaunch?.state.numberTicketsSold.toNumber() || 0}
                    </span>
                  </div>

                  <div className="flex-col">
                    <span className="font-lg weight-400 gray">Median Bid</span>
                    <span className="font-lg weight-600 white">
                      ◎ {formatNumber.format(median)}
                    </span>
                  </div>
                  <div className="flex-col">
                    <span className="font-lg weight-400 gray">
                      Total Raised
                    </span>
                    <span className="font-lg weight-600 white">
                      ◎{' '}
                      {formatNumber.format(
                        (fairLaunch?.treasury || 0) / LAMPORTS_PER_SOL,
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Grid>

        {/* *********************** NFT CARD SECTION */}
        {/*
         *
         *
         * *
         * *
         * *
         */}
        <Grid item xs={6} className="test-border">
          <div className="relative flex w-full h-full test-border">
            <div className="wiggle-pattern-container wiggle-svg"></div>
            <div className="nft-card-1">
              <div className="nft-card-img mb-md"></div>
              <div className="rarity-label">
                <span className="white font-md weight-500">Rarity 1/1</span>
              </div>
            </div>
            <div className="nft-card-2">
              <div className="nft-card-img mb-md"></div>
              <div className="rarity-label">
                <span className="white font-md weight-500">Rarity 1/1</span>
              </div>
            </div>
            <div className="nft-card-3">
              <div className="nft-card-img mb-md"></div>
              <div className="rarity-label">
                <span className="white font-md weight-500">Rarity 1/1</span>
              </div>
            </div>
          </div>
        </Grid>
        {/* *********************** END NFT CARD SECTION */}
      </Grid>
      <Snackbar
        open={alertState.open}
        autoHideDuration={6000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
      <Dialog
        open={antiRugPolicyOpen}
        onClose={() => {
          setAnitRugPolicyOpen(false);
        }}
        PaperProps={{
          style: { backgroundColor: '#222933', borderRadius: 6 },
        }}
      >
        <MuiDialogContent style={{ padding: 24 }}>
          {!fairLaunch?.state.data.antiRugSetting && (
            <span>This Fair Launch has no anti-rug settings.</span>
          )}
          {fairLaunch?.state.data.antiRugSetting &&
            fairLaunch.state.data.antiRugSetting.selfDestructDate && (
              <div>
                <h3>Anti-Rug Policy</h3>
                <p>
                  This raffle is governed by a smart contract to prevent the
                  artist from running away with your money.
                </p>
                <p>How it works:</p>
                This project will retain{' '}
                {fairLaunch.state.data.antiRugSetting.reserveBp / 100}% (◎{' '}
                {(fairLaunch?.treasury *
                  fairLaunch.state.data.antiRugSetting.reserveBp) /
                  (LAMPORTS_PER_SOL * 10000)}
                ) of the pledged amount in a locked state until all but{' '}
                {fairLaunch.state.data.antiRugSetting.tokenRequirement.toNumber()}{' '}
                NFTs (out of up to{' '}
                {fairLaunch.state.data.numberOfTokens.toNumber()}) have been
                minted.
                <p>
                  If more than{' '}
                  {fairLaunch.state.data.antiRugSetting.tokenRequirement.toNumber()}{' '}
                  NFTs remain as of{' '}
                  {toDate(
                    fairLaunch.state.data.antiRugSetting.selfDestructDate,
                  )?.toLocaleDateString()}{' '}
                  at{' '}
                  {toDate(
                    fairLaunch.state.data.antiRugSetting.selfDestructDate,
                  )?.toLocaleTimeString()}
                  , you will have the option to get a refund of{' '}
                  {fairLaunch.state.data.antiRugSetting.reserveBp / 100}% of the
                  cost of your token.
                </p>
                <br></br><br></br>
                {fairLaunch?.ticket?.data &&
                  !fairLaunch?.ticket?.data.state.withdrawn && (
                    <MintButton
                      onClick={onRugRefund}
                      variant="contained"
                      disabled={
                        !!!fairLaunch.ticket.data ||
                        !fairLaunch.ticket.data.state.punched ||
                        Date.now() / 1000 <
                          fairLaunch.state.data.antiRugSetting.selfDestructDate.toNumber()
                      }
                    >
                      {isMinting ? (
                        <CircularProgress />
                      ) : Date.now() / 1000 <
                        fairLaunch.state.data.antiRugSetting.selfDestructDate.toNumber() ? (
                        <span>
                          Refund in...
                          <Countdown
                            date={toDate(
                              fairLaunch.state.data.antiRugSetting
                                .selfDestructDate,
                            )}
                          />
                        </span>
                      ) : (
                        'Refund'
                      )}
                      {}
                    </MintButton>
                  )}
                <div style={{ textAlign: 'center', marginTop: '10px' }}>
                  {fairLaunch?.ticket?.data &&
                    !fairLaunch?.ticket?.data?.state.punched && (
                      <small>
                        You currently have a ticket but it has not been punched
                        yet, so cannot be refunded.
                      </small>
                    )}
                </div>
              </div>
            )}
        </MuiDialogContent>
      </Dialog>
      <MoreInfoModal
        open={howToOpen}
        onClose={() => setHowToOpen(false)}
        setHowToOpen={setHowToOpen}
        PaperProps={{}}
        fairLaunch={fairLaunch}
        candyMachinePredatesFairLaunch={candyMachinePredatesFairLaunch}
        candyMachine={candyMachine}
      />
      <div className="social-links flex-row space-between-lg flex align-center">
        <span className="link white font-md weight-400 cursor-pointer"><a href="https://t.co/Vskz9PkBBC?amp=1" target="_blank">Discord</a></span>
        <span className="link white font-md weight-400 cursor-pointer"><a href="https://twitter.com/PhantasiaSports" target="_blank">Twitter</a></span>
        <img className="w-2" src={phantasia_logo}></img>
      </div>
    </div>
  );
};

interface AlertState {
  open: boolean;
  message: string;
  severity: 'success' | 'info' | 'warning' | 'error' | undefined;
}

export default Home;
